#!/usr/bin/env python3
"""Copies the accounts, opportunities, contacts and contact roles Jeremy works with from
Salesforce to the app's data folder, and answers live activity lookups for the app.

Runs with the Salesforce CLI only. Nothing here reads or prints credentials.
"""

import datetime
import fcntl
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

MAX_QUERY_CHARS = 9000
ID_BATCH = 150
CLI_TIMEOUT = 300
RETRY_WAITS = (15, 60)
SKIPPED_TYPES = ("address", "location", "base64")
NAMED_REFERENCES = ("User", "Account", "Contact", "Opportunity", "Lead", "Campaign",
                    "RecordType", "Group", "Pricebook2")
OBJECTS = ("Account", "Opportunity", "Contact", "OpportunityContactRole")
MAX_ACTIVITY_CONTACTS = 60
MAX_ACTIVITY_ACCOUNTS = 10
ACTIVITY_CACHE_DAYS = 30


def support_dir():
    override = os.environ.get("ORGANIZER_SUPPORT_DIR")
    if override:
        return override
    return os.path.expanduser("~/Library/Application Support/DesktopOrganizer")


def log(message):
    stamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    sys.stdout.write("%s %s\n" % (stamp, message))
    sys.stdout.flush()


def now_iso():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def find_cli():
    candidates = [
        os.environ.get("SF_CLI"),
        os.path.expanduser("~/.local/sf/bin/sf"),
        "/usr/local/bin/sf",
        "/opt/homebrew/bin/sf",
    ]
    for path in candidates:
        if path and os.access(path, os.X_OK):
            return path
    return None


class SignInError(Exception):
    pass


class SyncError(Exception):
    pass


def is_signin_error(text):
    needles = ("NoAuthInfoFound", "NamedOrgNotFound", "RefreshTokenAuthError", "INVALID_SESSION_ID",
               "invalid_grant", "expired access/refresh token", "No authorization information found",
               "No AuthInfo found", "Error authenticating", "INVALID_LOGIN", "expired")
    lowered = text.lower()
    return any(needle.lower() in lowered for needle in needles)


def is_network_error(text):
    needles = ("ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "socket hang up",
               "fetch failed", "timed out", "timeout", "network", "ENETUNREACH", "EHOSTUNREACH",
               "getaddrinfo", "UNABLE_TO_LOCK_ROW", "REQUEST_LIMIT_EXCEEDED", "503", "502")
    lowered = text.lower()
    return any(needle.lower() in lowered for needle in needles)


def should_retry(text, attempt):
    """Network trouble is retried twice; sign-in trouble never is."""
    if is_signin_error(text):
        return False
    return attempt < len(RETRY_WAITS) and is_network_error(text)


class Cli:
    def __init__(self, path, alias):
        self.path = path
        self.alias = alias

    def run(self, args):
        attempt = 0
        while True:
            try:
                output = self._run_once(args)
            except subprocess.TimeoutExpired:
                output = {"status": 1, "message": "The Salesforce CLI timed out after %d seconds." % CLI_TIMEOUT, "name": "timeout"}
            if output.get("status", 1) == 0:
                return output
            text = json.dumps(output)
            message = output.get("message") or output.get("name") or "The Salesforce CLI failed."
            if is_signin_error(text):
                raise SignInError(message)
            if should_retry(text, attempt):
                wait = RETRY_WAITS[attempt]
                log("Retrying in %ds after: %s" % (wait, message))
                time.sleep(wait)
                attempt += 1
                continue
            raise SyncError(message)

    def _run_once(self, args):
        env = dict(os.environ)
        env["SF_ORG_MAX_QUERY_LIMIT"] = "5000000"
        env.setdefault("SF_AUTOUPDATE_DISABLE", "true")
        env.setdefault("SF_DISABLE_TELEMETRY", "true")
        completed = subprocess.run(
            [self.path] + args + ["--target-org", self.alias, "--json"],
            capture_output=True, text=True, timeout=CLI_TIMEOUT, env=env,
        )
        raw = completed.stdout.strip() or completed.stderr.strip()
        try:
            parsed = json.loads(raw)
        except ValueError:
            return {"status": completed.returncode or 1, "message": raw[-2000:] or "The Salesforce CLI returned nothing."}
        if not isinstance(parsed, dict):
            return {"status": 1, "message": "Unexpected CLI output."}
        if "status" not in parsed:
            parsed["status"] = completed.returncode
        return parsed

    def describe(self, name):
        return self.run(["sobject", "describe", "--sobject", name])["result"]

    def query(self, soql):
        result = self.run(["data", "query", "--query", soql])["result"]
        records = result.get("records") or []
        total = result.get("totalSize", len(records))
        if len(records) < total:
            raise SyncError("Salesforce returned %d of %d records for %s" % (len(records), total, soql[:80]))
        return records


# --- Field selection and query splitting -------------------------------------------------------

def is_custom(name):
    return name.endswith("__c")


def select_fields(describe):
    """Returns (field names to query, field metadata for the objects table)."""
    names = []
    metadata = []
    for field in describe.get("fields", []):
        if field.get("type") in SKIPPED_TYPES:
            continue
        name = field["name"]
        names.append(name)
        metadata.append({
            "name": name,
            "label": field.get("label") or name,
            "type": field.get("type") or "string",
            "relationshipName": field.get("relationshipName"),
            "html": field.get("extraTypeInfo") == "richtextarea",
        })
        refs = field.get("referenceTo") or []
        relationship = field.get("relationshipName")
        if field.get("type") == "reference" and relationship and refs:
            named = len(refs) > 1 or any(ref in NAMED_REFERENCES or is_custom(ref) for ref in refs)
            if named:
                names.append(relationship + ".Name")
    return names, metadata


def encoded_length(soql):
    return len(urllib.parse.quote(soql))


def build_query(fields, obj, where):
    clause = " WHERE " + where if where else ""
    return "SELECT " + ", ".join(fields) + " FROM " + obj + clause + " ORDER BY Id"


def split_queries(fields, obj, where, limit=MAX_QUERY_CHARS):
    """Splits a long field list into queries that each stay under the URL size limit.
    Every query carries Id so results merge by Id."""
    others = [field for field in fields if field != "Id"]
    queries = []
    current = ["Id"]
    for field in others:
        candidate = current + [field]
        if len(current) > 1 and encoded_length(build_query(candidate, obj, where)) > limit:
            queries.append(build_query(current, obj, where))
            current = ["Id", field]
        else:
            current = candidate
    queries.append(build_query(current, obj, where))
    return queries


def flatten(record):
    """Turns {"Owner": {"Name": "Ann"}} into {"Owner.Name": "Ann"} and drops attributes."""
    flat = {}
    for key, value in record.items():
        if key == "attributes":
            continue
        if isinstance(value, dict):
            for inner_key, inner_value in flatten(value).items():
                flat[key + "." + inner_key] = inner_value
        else:
            flat[key] = value
    return flat


INVALID_FIELD_PATTERNS = (
    re.compile(r"No such column '([^']+)'"),
    re.compile(r"Didn't understand relationship '([^']+)'"),
    re.compile(r"INVALID_FIELD:?\s*([A-Za-z0-9_.]+)"),
)


def invalid_fields(message, fields):
    """Field names a failed query complained about; empty when it did not name any."""
    found = set()
    for pattern in INVALID_FIELD_PATTERNS:
        for match in pattern.finditer(message):
            found.add(match.group(1))
    named = set()
    for field in fields:
        base = field.split(".")[0]
        if field in found or base in found:
            named.add(field)
    return named


def is_invalid_field_error(message):
    return "INVALID_FIELD" in message or "INVALID_TYPE" in message or "No such column" in message


def fetch_object(cli, obj, fields, where):
    """Queries every field in chunks, merging rows by Id. Drops fields Salesforce rejects."""
    fields = list(fields)
    merged = {}
    pending = split_queries(fields, obj, where)
    while pending:
        soql = pending.pop(0)
        try:
            rows = cli.query(soql)
        except SyncError as err:
            message = str(err)
            if not is_invalid_field_error(message):
                raise
            selected = soql[len("SELECT "):soql.index(" FROM ")].split(", ")
            bad = invalid_fields(message, selected)
            if not bad:
                bad = set(field for field in selected if "." in field)
            if not bad:
                raise
            log("Dropping fields Salesforce rejected on %s: %s" % (obj, ", ".join(sorted(bad))))
            fields = [field for field in fields if field not in bad]
            kept = [field for field in selected if field not in bad]
            if len(kept) > 1:
                pending.insert(0, build_query(kept, obj, where))
            continue
        for row in rows:
            flat = flatten(row)
            merged.setdefault(flat["Id"], {}).update(flat)
    return merged, fields


def in_list(ids):
    return "(" + ", ".join("'" + value + "'" for value in ids) + ")"


def batched(values, size=ID_BATCH):
    values = list(values)
    for start in range(0, len(values), size):
        yield values[start:start + size]


# --- LinkedIn field --------------------------------------------------------------------------

def detect_linkedin_field(contact_fields):
    """The Contact field holding LinkedIn URLs: URL fields first, then the shortest name."""
    skip = ("company", "source", "token", "unvalidated")
    candidates = []
    for field in contact_fields:
        name = field.get("name", "")
        label = field.get("label", "") or ""
        if "linkedin" not in (name + " " + label).lower():
            continue
        if any(word in label.lower() for word in skip):
            continue
        if field.get("type") not in ("url", "string", "textarea"):
            continue
        candidates.append(field)
    if not candidates:
        return None
    candidates.sort(key=lambda field: (0 if field.get("type") == "url" else 1, len(field.get("name", "")), field.get("name", "")))
    return candidates[0]["name"]


# --- Status and files --------------------------------------------------------------------------

class Status:
    def __init__(self, folder):
        self.path = os.path.join(folder, "salesforce-status.json")
        self.started = now_iso()

    def write(self, state, message="", counts=None, finished=False):
        payload = {
            "state": state,
            "startedAt": self.started,
            "finishedAt": now_iso() if finished else "",
            "message": message,
            "counts": counts or {},
        }
        write_json(self.path, payload)


def write_json(path, payload, compact=False):
    folder = os.path.dirname(path)
    os.makedirs(folder, exist_ok=True)
    handle, temp = tempfile.mkstemp(prefix=".tmp-", dir=folder)
    with os.fdopen(handle, "w") as out:
        if compact:
            json.dump(payload, out, separators=(",", ":"))
        else:
            json.dump(payload, out, indent=2)
    os.replace(temp, path)


def read_json(path, fallback):
    try:
        with open(path) as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return fallback


def load_config(folder):
    config = read_json(os.path.join(folder, "salesforce-config.json"), None)
    if not isinstance(config, dict):
        raise SyncError("No salesforce-config.json yet. Finish the Salesforce setup first.")
    for key in ("orgAlias", "instanceUrl", "accountWhere", "opportunityWhere", "accountPartnerField"):
        if not config.get(key):
            raise SyncError("salesforce-config.json is missing %s." % key)
    return config


# --- The copy ----------------------------------------------------------------------------------

def refresh(folder):
    status = Status(folder)
    status.write("running")
    try:
        config = load_config(folder)
        cli_path = find_cli()
        if not cli_path:
            raise SyncError("The Salesforce CLI isn't installed.")
        cli = Cli(cli_path, config["orgAlias"])
        counts = copy_everything(cli, config, folder)
        status.write("ok", "", counts, finished=True)
        log("Refresh finished: %s" % json.dumps(counts))
        return 0
    except SignInError as err:
        status.write("signin", str(err), finished=True)
        log("Sign-in needed: %s" % err)
        return 2
    except (SyncError, OSError, sqlite3.Error, KeyError, ValueError) as err:
        status.write("error", str(err), finished=True)
        log("Refresh failed: %s" % err)
        return 1


def copy_everything(cli, config, folder):
    describes = {}
    fields = {}
    metadata = {}
    for obj in OBJECTS:
        describes[obj] = cli.describe(obj)
        fields[obj], metadata[obj] = select_fields(describes[obj])
        log("Described %s: %d fields" % (obj, len(fields[obj])))

    accounts, fields["Account"] = fetch_object(cli, "Account", fields["Account"], config["accountWhere"])
    log("Accounts in scope: %d" % len(accounts))

    opportunities, fields["Opportunity"] = fetch_object(cli, "Opportunity", fields["Opportunity"], config["opportunityWhere"])
    log("Opportunities by my field: %d" % len(opportunities))

    # Opportunities on the accounts, then the accounts those opportunities point to.
    for batch in batched(accounts.keys()):
        more, fields["Opportunity"] = fetch_object(cli, "Opportunity", fields["Opportunity"], "AccountId IN " + in_list(batch))
        opportunities.update(more)
    missing_accounts = set(opp.get("AccountId") for opp in opportunities.values() if opp.get("AccountId")) - set(accounts.keys())
    for batch in batched(missing_accounts):
        more, fields["Account"] = fetch_object(cli, "Account", fields["Account"], "Id IN " + in_list(batch))
        accounts.update(more)
    log("Accounts after opportunities: %d, opportunities: %d" % (len(accounts), len(opportunities)))

    contacts = {}
    for batch in batched(accounts.keys()):
        more, fields["Contact"] = fetch_object(cli, "Contact", fields["Contact"], "AccountId IN " + in_list(batch))
        contacts.update(more)
    log("Contacts: %d" % len(contacts))

    roles = {}
    for batch in batched(opportunities.keys()):
        more, fields["OpportunityContactRole"] = fetch_object(cli, "OpportunityContactRole", fields["OpportunityContactRole"], "OpportunityId IN " + in_list(batch))
        roles.update(more)
    missing_contacts = set(role.get("ContactId") for role in roles.values() if role.get("ContactId")) - set(contacts.keys())
    for batch in batched(missing_contacts):
        more, fields["Contact"] = fetch_object(cli, "Contact", fields["Contact"], "Id IN " + in_list(batch))
        contacts.update(more)
    log("Contact roles: %d, contacts after roles: %d" % (len(roles), len(contacts)))

    linkedin_field = detect_linkedin_field(metadata["Contact"])
    synced_at = now_iso()
    scope = {"accountWhere": config["accountWhere"], "opportunityWhere": config["opportunityWhere"]}

    write_database(folder, describes, metadata, accounts, opportunities, contacts, roles, synced_at, config["instanceUrl"], scope, linkedin_field)
    write_index(folder, config, accounts, opportunities, contacts, roles, synced_at, linkedin_field)
    return {
        "accounts": len(accounts),
        "opportunities": len(opportunities),
        "contacts": len(contacts),
        "roles": len(roles),
    }


def write_database(folder, describes, metadata, accounts, opportunities, contacts, roles, synced_at, instance_url, scope, linkedin_field):
    final = os.path.join(folder, "salesforce.sqlite")
    temp = final + ".tmp"
    if os.path.exists(temp):
        os.remove(temp)
    db = sqlite3.connect(temp)
    try:
        db.execute("CREATE TABLE objects (name TEXT PRIMARY KEY, label TEXT, fields TEXT)")
        db.execute("CREATE TABLE records (id TEXT PRIMARY KEY, object TEXT, account_id TEXT, data TEXT)")
        db.execute("CREATE INDEX records_account ON records(account_id)")
        db.execute("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)")
        for obj in OBJECTS:
            db.execute("INSERT INTO objects VALUES (?, ?, ?)", (obj, describes[obj].get("label") or obj, json.dumps(metadata[obj])))
        opp_account = dict((opp_id, opp.get("AccountId") or "") for opp_id, opp in opportunities.items())

        def rows(obj, records, account_of):
            for record_id, record in records.items():
                yield (record_id, obj, account_of(record) or "", json.dumps(record))

        db.executemany("INSERT OR REPLACE INTO records VALUES (?, ?, ?, ?)", rows("Account", accounts, lambda r: r.get("Id")))
        db.executemany("INSERT OR REPLACE INTO records VALUES (?, ?, ?, ?)", rows("Opportunity", opportunities, lambda r: r.get("AccountId")))
        db.executemany("INSERT OR REPLACE INTO records VALUES (?, ?, ?, ?)", rows("Contact", contacts, lambda r: r.get("AccountId")))
        db.executemany("INSERT OR REPLACE INTO records VALUES (?, ?, ?, ?)", rows("OpportunityContactRole", roles, lambda r: opp_account.get(r.get("OpportunityId") or "")))
        for key, value in (("syncedAt", synced_at), ("instanceUrl", instance_url), ("scope", json.dumps(scope)), ("linkedinField", linkedin_field or "")):
            db.execute("INSERT INTO meta VALUES (?, ?)", (key, value))
        db.commit()
    finally:
        db.close()
    os.replace(temp, final)


def write_index(folder, config, accounts, opportunities, contacts, roles, synced_at, linkedin_field):
    partner_field = config["accountPartnerField"]
    partners = config.get("partners") or {}
    user_to_partner = {}
    for partner_id, info in partners.items():
        if isinstance(info, dict) and info.get("id"):
            user_to_partner[info["id"]] = partner_id
            user_to_partner[info["id"][:15]] = partner_id
    index = {
        "syncedAt": synced_at,
        "instanceUrl": config["instanceUrl"],
        "linkedinField": linkedin_field or "",
        "partners": partners,
        "accounts": [],
        "opportunities": [],
        "contacts": [],
        "roles": [],
    }
    for account_id, account in sorted(accounts.items()):
        owner_value = account.get(partner_field) or ""
        index["accounts"].append({
            "id": account_id,
            "name": account.get("Name") or "",
            "partnerId": user_to_partner.get(owner_value, ""),
            "owner": account.get("Owner.Name") or "",
            "lastActivity": account.get("LastActivityDate") or "",
        })
    for opp_id, opp in sorted(opportunities.items()):
        index["opportunities"].append({
            "id": opp_id,
            "name": opp.get("Name") or "",
            "accountId": opp.get("AccountId") or "",
            "stage": opp.get("StageName") or "",
            "closeDate": opp.get("CloseDate") or "",
            "closed": bool(opp.get("IsClosed")),
            "owner": opp.get("Owner.Name") or "",
        })
    for contact_id, contact in sorted(contacts.items()):
        index["contacts"].append({
            "id": contact_id,
            "name": contact.get("Name") or "",
            "title": contact.get("Title") or "",
            "accountId": contact.get("AccountId") or "",
            "linkedin": (contact.get(linkedin_field) or "") if linkedin_field else "",
            "email": contact.get("Email") or "",
        })
    for role in roles.values():
        index["roles"].append({
            "opportunityId": role.get("OpportunityId") or "",
            "contactId": role.get("ContactId") or "",
            "role": role.get("Role") or "",
            "primary": bool(role.get("IsPrimary")),
        })
    write_json(os.path.join(folder, "salesforce-index.json"), index, compact=True)


# --- Activity lookups ----------------------------------------------------------------------------

ID_PATTERN = re.compile(r"^[A-Za-z0-9]{15}([A-Za-z0-9]{3})?$")


def valid_ids(values, limit):
    out = []
    for value in values if isinstance(values, list) else []:
        if isinstance(value, str) and ID_PATTERN.match(value) and value not in out:
            out.append(value)
    return out[:limit]


def to_local_date(value):
    """Salesforce date-times are UTC; dates (YYYY-MM-DD) are already calendar days."""
    if not value:
        return ""
    if len(value) == 10:
        return value
    for pattern in ("%Y-%m-%dT%H:%M:%S.%f%z", "%Y-%m-%dT%H:%M:%S%z"):
        try:
            parsed = datetime.datetime.strptime(value, pattern)
            return parsed.astimezone().strftime("%Y-%m-%d")
        except ValueError:
            continue
    return value[:10]


def task_label(task):
    subtype = (task.get("TaskSubtype") or "").lower()
    if subtype == "email":
        return "Email"
    if subtype == "call":
        return "Call"
    if subtype == "listemail":
        return "List email"
    if subtype == "linkedin":
        return "LinkedIn"
    kind = (task.get("Type") or "").lower()
    if "email" in kind:
        return "Email"
    if "call" in kind:
        return "Call"
    return "Task"


def activity_item(record, kind):
    if kind == "task":
        date = to_local_date(record.get("CompletedDateTime") or record.get("ActivityDate") or record.get("LastModifiedDate"))
        label = task_label(record)
    else:
        date = to_local_date(record.get("StartDateTime") or record.get("ActivityDate"))
        label = "Meeting"
    return {
        "id": record.get("Id") or "",
        "kind": kind,
        "label": label,
        "subject": record.get("Subject") or "",
        "date": date,
        "owner": record.get("Owner.Name") or "",
        "who": record.get("Who.Name") or "",
        "whoId": record.get("WhoId") or "",
        "whatId": record.get("WhatId") or "",
    }


TASK_FIELDS = ["Id", "Subject", "ActivityDate", "CompletedDateTime", "LastModifiedDate", "WhoId", "WhatId",
               "Owner.Name", "Who.Name", "TaskSubtype", "Type", "AccountId"]
EVENT_FIELDS = ["Id", "Subject", "ActivityDate", "StartDateTime", "WhoId", "WhatId", "Owner.Name", "Who.Name", "AccountId"]


def activity_queries(contacts, accounts):
    """One job per query; the caller runs them in parallel."""
    jobs = []
    if contacts:
        ids = in_list(contacts)
        jobs.append(("task", "contacts", "SELECT %s FROM Task WHERE WhoId IN %s AND IsClosed = true ORDER BY ActivityDate DESC NULLS LAST, LastModifiedDate DESC LIMIT 1000" % (", ".join(TASK_FIELDS), ids)))
        jobs.append(("event", "contacts", "SELECT %s FROM Event WHERE WhoId IN %s AND StartDateTime <= %s ORDER BY StartDateTime DESC LIMIT 200" % (", ".join(EVENT_FIELDS), ids, now_iso())))
    for account in accounts:
        jobs.append(("task", account, "SELECT %s FROM Task WHERE (WhatId = '%s' OR AccountId = '%s') AND IsClosed = true ORDER BY ActivityDate DESC NULLS LAST, LastModifiedDate DESC LIMIT 100" % (", ".join(TASK_FIELDS), account, account)))
        jobs.append(("event", account, "SELECT %s FROM Event WHERE (WhatId = '%s' OR AccountId = '%s') AND StartDateTime <= %s ORDER BY StartDateTime DESC LIMIT 1" % (", ".join(EVENT_FIELDS), account, account, now_iso())))
    return jobs


def run_activity_query(cli, soql):
    """Runs one query, dropping any field this org doesn't have."""
    while True:
        try:
            return cli.query(soql)
        except SyncError as err:
            message = str(err)
            if not is_invalid_field_error(message):
                raise
            selected = soql[len("SELECT "):soql.index(" FROM ")].split(", ")
            bad = invalid_fields(message, selected)
            if not bad:
                raise
            kept = [field for field in selected if field not in bad]
            soql = "SELECT " + ", ".join(kept) + soql[soql.index(" FROM "):]


def newer(a, b):
    if not a:
        return b
    if not b:
        return a
    return a if a["date"] >= b["date"] else b


def activity(folder, payload_text):
    try:
        payload = json.loads(payload_text)
    except ValueError:
        log("Activity request wasn't JSON.")
        return 1
    contacts = valid_ids(payload.get("contacts"), MAX_ACTIVITY_CONTACTS)
    accounts = valid_ids(payload.get("accounts"), MAX_ACTIVITY_ACCOUNTS)
    after = payload.get("after") if isinstance(payload.get("after"), str) else ""
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", after or ""):
        after = ""
    cache_path = os.path.join(folder, "salesforce-activity.json")
    cache = read_json(cache_path, {})
    if not isinstance(cache, dict):
        cache = {}
    cache.setdefault("contacts", {})
    cache.setdefault("accounts", {})
    prune_cache(cache)
    if not contacts and not accounts:
        write_json(cache_path, cache)
        return 0
    try:
        config = load_config(folder)
        cli_path = find_cli()
        if not cli_path:
            raise SyncError("The Salesforce CLI isn't installed.")
        cli = Cli(cli_path, config["orgAlias"])
        jobs = activity_queries(contacts, accounts)
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda job: (job[0], job[1], run_activity_query(cli, job[2])), jobs))
    except (SignInError, SyncError, OSError, KeyError, ValueError) as err:
        log("Activity lookup failed: %s" % err)
        write_json(cache_path, cache)
        return 1

    fetched = now_iso()
    latest_by_contact = {}
    count_by_contact = dict((contact, 0) for contact in contacts)
    latest_by_account = {}
    for kind, target, rows in results:
        for row in rows:
            item = activity_item(flatten(row), kind)
            if target == "contacts":
                who = item["whoId"]
                if who not in count_by_contact:
                    who = who[:15]
                    matches = [contact for contact in contacts if contact[:15] == who]
                    who = matches[0] if matches else None
                if not who:
                    continue
                latest_by_contact[who] = newer(latest_by_contact.get(who), item)
                if after and item["date"] > after:
                    count_by_contact[who] += 1
            else:
                latest_by_account[target] = newer(latest_by_account.get(target), item)
    for contact in contacts:
        cache["contacts"][contact] = {
            "fetchedAt": fetched,
            "item": strip_item(latest_by_contact.get(contact)),
            "after": after,
            "newCount": count_by_contact.get(contact, 0),
        }
    for account in accounts:
        cache["accounts"][account] = {"fetchedAt": fetched, "item": strip_item(latest_by_account.get(account))}
    write_json(cache_path, cache)
    log("Activity lookup: %d contacts, %d accounts" % (len(contacts), len(accounts)))
    return 0


def strip_item(item):
    if not item:
        return None
    return dict((key, item[key]) for key in ("id", "kind", "label", "subject", "date", "owner", "who"))


def prune_cache(cache):
    cutoff = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=ACTIVITY_CACHE_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    for bucket in ("contacts", "accounts"):
        entries = cache.get(bucket) or {}
        cache[bucket] = dict((key, value) for key, value in entries.items()
                             if isinstance(value, dict) and (value.get("fetchedAt") or "") >= cutoff)


# --- Entry point -------------------------------------------------------------------------------

def main(argv):
    folder = support_dir()
    os.makedirs(folder, exist_ok=True)
    if len(argv) >= 2 and argv[1] == "--activity":
        return activity(folder, argv[2] if len(argv) > 2 else "{}")
    lock_path = os.path.join(folder, "salesforce-sync.lock")
    lock = open(lock_path, "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        log("A refresh is already running.")
        return 0
    keeper = None
    if shutil.which("caffeinate"):
        keeper = subprocess.Popen(["caffeinate", "-i", "-w", str(os.getpid())])
    try:
        log("Refresh started")
        return refresh(folder)
    finally:
        if keeper:
            keeper.terminate()
        fcntl.flock(lock, fcntl.LOCK_UN)
        lock.close()


if __name__ == "__main__":
    sys.exit(main(sys.argv))
