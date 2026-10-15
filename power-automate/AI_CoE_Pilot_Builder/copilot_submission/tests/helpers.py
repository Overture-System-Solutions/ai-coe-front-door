"""Shared helpers: build the solution once into a temporary folder and run its flows from the ZIP bytes."""
import datetime as dt
import functools
import itertools
import json
import tempfile
import uuid
from pathlib import Path

import build_copilot_submission as builder
import profiles
import retarget
from fake_sharepoint import FakeSharePoint
from wdl import Runner

THURSDAY = dt.datetime(2026, 10, 8, 14, 3, 12, 345000, tzinfo=dt.timezone.utc)
FRIDAY = dt.datetime(2026, 10, 9, 14, 3, 12, 345000, tzinfo=dt.timezone.utc)

SIGNED_IN = {'requestorEmail': 'casey.lee@contoso.com', 'requestorName': 'Casey Lee', 'conversationId': 'conv-001'}


@functools.lru_cache(maxsize=1)
def built_zip():
    folder = Path(tempfile.mkdtemp(prefix='copilot-submission-test-'))
    return builder.build(folder)


@functools.lru_cache(maxsize=1)
def final_zip():
    """The built ZIP with the target's profile names applied (what build_pilot.py delivers)."""
    renames = profiles.mapping(builder.TARGET, 'copilot_submission')
    if not renames:
        return built_zip()
    return retarget.retarget(built_zip(), Path(tempfile.mkdtemp(prefix='copilot-submission-final-')) / 'final.zip', renames)


def final_name(text):
    return profiles.rename(builder.TARGET, 'copilot_submission', text)


def delivered(package):
    return builder.DELIVERY / profiles.output_file(builder.TARGET, package)


@functools.lru_cache(maxsize=1)
def definitions():
    return builder.load_definitions(built_zip())


def trigger_body(kind, values):
    spec = {item['name']: item for item in builder.INPUTS[kind]}
    body = {}
    for name, value in values.items():
        if name not in spec:
            raise KeyError('no %s input called %s' % (kind, name))
        if value is not None:
            body[spec[name]['key']] = value
    return body


_GUID_COUNTER = itertools.count(1)


def guid_stream():
    """Deterministic GUIDs that stay unique across runs (the record reference uses their first 8 hex digits)."""
    return (str(uuid.UUID(int=(next(_GUID_COUNTER) << 96) | 0xC0FFEE)) for _ in itertools.count())


def run(kind, values, sp=None, now=FRIDAY, signed_in=None):
    sp = sp if sp is not None else FakeSharePoint()
    body = dict(SIGNED_IN if signed_in is None else signed_in)
    body.update(values)
    runner = Runner(definitions()[kind], trigger_body=trigger_body(kind, body), connector=sp, now=now, guids=guid_stream())
    runner.run()
    if runner.response is None:
        raise AssertionError('the flow did not respond to the agent: %s' % runner.errors)
    return runner, sp


def payload(row):
    return json.loads(row['PayloadJson'])
