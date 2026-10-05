#!/usr/bin/env python3
"""Checks for salesforce_sync.py that never touch Salesforce."""

import os
import sys
import urllib.parse

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "Resources"))

import salesforce_sync as sync  # noqa: E402


def test_split_queries_stay_under_limit():
    fields = ["Id"] + ["Some_Long_Custom_Field_Name_%03d__c" % i for i in range(600)]
    where = "ClayDR__c = '005000000000001AAA'"
    queries = sync.split_queries(fields, "Account", where)
    assert len(queries) > 1, "a 600-field list must split"
    seen = set()
    for soql in queries:
        assert len(urllib.parse.quote(soql)) <= sync.MAX_QUERY_CHARS, "query over the limit"
        assert soql.endswith(" ORDER BY Id")
        assert soql.startswith("SELECT Id, ")
        selected = soql[len("SELECT "):soql.index(" FROM ")].split(", ")
        for field in selected[1:]:
            assert field not in seen, "field repeated across queries"
            seen.add(field)
    assert seen == set(fields) - {"Id"}
    short = sync.split_queries(["Id", "Name"], "Account", "")
    assert short == ["SELECT Id, Name FROM Account ORDER BY Id"]


def test_flatten_relationships():
    record = {
        "attributes": {"type": "Contact"},
        "Id": "003000000000001AAA",
        "Name": "Dana Reyes",
        "Owner": {"attributes": {"type": "User"}, "Name": "Jeremy White"},
        "Account": None,
    }
    flat = sync.flatten(record)
    assert flat == {"Id": "003000000000001AAA", "Name": "Dana Reyes", "Owner.Name": "Jeremy White", "Account": None}


def test_select_fields():
    describe = {"fields": [
        {"name": "Id", "type": "id", "label": "Id"},
        {"name": "BillingAddress", "type": "address", "label": "Billing Address"},
        {"name": "OwnerId", "type": "reference", "label": "Owner", "relationshipName": "Owner", "referenceTo": ["User"]},
        {"name": "Custom__c", "type": "reference", "label": "Custom", "relationshipName": "Custom__r", "referenceTo": ["Thing__c"]},
        {"name": "DandBCompanyId", "type": "reference", "label": "D&B", "relationshipName": "DandBCompany", "referenceTo": ["DandBCompany"]},
        {"name": "Description", "type": "textarea", "label": "Description", "extraTypeInfo": "richtextarea"},
        {"name": "Photo", "type": "base64", "label": "Photo"},
    ]}
    names, metadata = sync.select_fields(describe)
    assert names == ["Id", "OwnerId", "Owner.Name", "Custom__c", "Custom__r.Name", "DandBCompanyId", "Description"]
    assert [item["name"] for item in metadata] == ["Id", "OwnerId", "Custom__c", "DandBCompanyId", "Description"]
    assert metadata[4]["html"] is True
    assert metadata[1]["relationshipName"] == "Owner"


def test_linkedin_detection():
    fields = [
        {"name": "LinkedIn_Company__c", "label": "LinkedIn Company Page", "type": "url"},
        {"name": "Linkedin_Source__c", "label": "LinkedIn Source", "type": "string"},
        {"name": "Linkedin_Profile_Text__c", "label": "LinkedIn", "type": "string"},
        {"name": "LinkedIn__c", "label": "LinkedIn URL", "type": "url"},
        {"name": "LinkedIn_Token__c", "label": "LinkedIn Token", "type": "string"},
    ]
    assert sync.detect_linkedin_field(fields) == "LinkedIn__c"
    assert sync.detect_linkedin_field(fields[:3]) == "Linkedin_Profile_Text__c"
    assert sync.detect_linkedin_field([{"name": "Email", "label": "Email", "type": "email"}]) is None
    assert sync.detect_linkedin_field([
        {"name": "Longer_LinkedIn__c", "label": "LinkedIn", "type": "string"},
        {"name": "LI_LinkedIn__c", "label": "LinkedIn", "type": "string"},
    ]) == "LI_LinkedIn__c"


def test_retry_rules():
    assert sync.should_retry("Error: read ECONNRESET", 0) is True
    assert sync.should_retry("Error: read ECONNRESET", 1) is True
    assert sync.should_retry("Error: read ECONNRESET", 2) is False
    assert sync.should_retry("fetch failed getaddrinfo ENOTFOUND clay.my.salesforce.com", 0) is True
    assert sync.should_retry("NoAuthInfoFound: No authorization information found for organizer", 0) is False
    assert sync.should_retry("RefreshTokenAuthError: expired access/refresh token", 0) is False
    assert sync.should_retry("INVALID_FIELD: No such column 'Foo__c' on entity 'Account'", 0) is False
    assert sync.is_signin_error("The org's refresh token has expired") is True
    assert sync.is_signin_error("MALFORMED_QUERY: unexpected token") is False


def test_invalid_fields():
    fields = ["Id", "Name", "Foo__c", "Owner.Name", "Custom__r.Name"]
    assert sync.invalid_fields("INVALID_FIELD: No such column 'Foo__c' on entity 'Account'", fields) == {"Foo__c"}
    assert sync.invalid_fields("Didn't understand relationship 'Custom__r' in field path", fields) == {"Custom__r.Name"}
    assert sync.invalid_fields("INVALID_TYPE: something else", fields) == set()


def test_activity_helpers():
    assert sync.valid_ids(["003000000000001AAA", "bad id", "003000000000001AAA", "003000000000002"], 60) == ["003000000000001AAA", "003000000000002"]
    assert len(sync.valid_ids(["0030000000000%02dAAA" % i for i in range(80)], 60)) == 60
    assert sync.to_local_date("2026-10-01") == "2026-10-01"
    assert len(sync.to_local_date("2026-10-01T14:03:00.000+0000")) == 10
    assert sync.task_label({"TaskSubtype": "Email"}) == "Email"
    assert sync.task_label({"TaskSubtype": "Call"}) == "Call"
    assert sync.task_label({"Type": "Other"}) == "Task"
    assert sync.newer({"date": "2026-10-01"}, {"date": "2026-10-03"})["date"] == "2026-10-03"
    jobs = sync.activity_queries(["003000000000001AAA"], ["001000000000001AAA"])
    assert len(jobs) == 4
    assert "LIMIT 1000" in jobs[0][2] and "LIMIT 200" in jobs[1][2]
    assert "LIMIT 100" in jobs[2][2] and "LIMIT 1" in jobs[3][2]


def main():
    tests = [value for name, value in sorted(globals().items()) if name.startswith("test_")]
    for test in tests:
        test()
    print("sync_test.py: ok (%d tests)" % len(tests))


if __name__ == "__main__":
    main()
