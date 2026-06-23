import json

import pytest

from backend.llm import _normalize_result, parse_title, parse_titles
from backend.config import Config


class FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def json(self):
        return self._payload

    def raise_for_status(self):
        pass


class FakeClient:
    def __init__(self, response_payload):
        self._response_payload = response_payload

    async def post(self, *args, **kwargs):
        return FakeResponse(self._response_payload)

    async def aclose(self):
        pass


def test_normalize_result_defaults():
    assert _normalize_result({}) == {
        "title": None,
        "riddle_theme": None,
        "guest_names": [],
        "format": "other",
        "is_bonus": False,
    }


def test_normalize_result_complete():
    item = {
        "title": "The Clockwork Riddle",
        "riddle_theme": "clockwork",
        "guest_names": [" Alex ", "  "],
        "format": "bonus",
        "is_bonus": True,
    }
    assert _normalize_result(item) == {
        "title": "The Clockwork Riddle",
        "riddle_theme": "clockwork",
        "guest_names": ["Alex"],
        "format": "bonus",
        "is_bonus": True,
    }


@pytest.mark.asyncio
async def test_parse_titles_list_response():
    config = Config(openrouter_api_key="fake", enable_llm_parsing=True)
    payload = {
        "choices": [
            {
                "message": {
                    "content": json.dumps([
                        {"title": "A", "riddle_theme": "x", "guest_names": [], "format": "main", "is_bonus": False},
                        {"title": "B", "format": "bonus"},
                    ])
                }
            }
        ]
    }
    client = FakeClient(payload)
    results = await parse_titles(["raw A", "raw B"], config, client)
    assert results[0]["title"] == "A"
    assert results[0]["format"] == "main"
    assert results[1]["title"] == "B"
    assert results[1]["format"] == "bonus"


@pytest.mark.asyncio
async def test_parse_titles_disabled():
    config = Config(enable_llm_parsing=False)
    results = await parse_titles(["whatever"], config)
    assert results == [None]


@pytest.mark.asyncio
async def test_parse_titles_wrapped_in_episodes_key():
    config = Config(openrouter_api_key="fake", enable_llm_parsing=True)
    payload = {
        "choices": [
            {
                "message": {
                    "content": json.dumps({
                        "episodes": [
                            {"title": "Clockwork", "format": "main"},
                        ]
                    })
                }
            }
        ]
    }
    client = FakeClient(payload)
    results = await parse_titles(["raw"], config, client)
    assert results[0]["title"] == "Clockwork"
    assert results[0]["format"] == "main"


@pytest.mark.asyncio
async def test_parse_title_single():
    config = Config(openrouter_api_key="fake", enable_llm_parsing=True)
    payload = {
        "choices": [
            {
                "message": {
                    "content": json.dumps([{"title": "Solo", "format": "live"}])
                }
            }
        ]
    }
    client = FakeClient(payload)
    result = await parse_title("raw solo", config, client)
    assert result["title"] == "Solo"
    assert result["format"] == "live"


@pytest.mark.asyncio
async def test_parse_titles_http_error():
    config = Config(openrouter_api_key="fake", enable_llm_parsing=True)

    class BadResponse:
        def raise_for_status(self):
            raise RuntimeError("boom")

    class BadClient:
        async def post(self, *args, **kwargs):
            return BadResponse()

        async def aclose(self):
            pass

    results = await parse_titles(["one"], config, BadClient())
    assert results == [None]
