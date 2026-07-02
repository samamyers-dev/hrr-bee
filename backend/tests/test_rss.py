import pytest

from backend.rss import parse_feed, parse_duration, parse_episode_number


def _make_rss(entries_xml: str) -> str:
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" version="2.0">
  <channel>
    <title>Test Feed</title>
    {entries_xml}
  </channel>
</rss>
"""


def test_parse_feed_basic():
    rss = _make_rss("""
    <item>
      <guid>ep-1</guid>
      <title>#1: The First Riddle</title>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
      <enclosure url="https://example.com/ep1.mp3" type="audio/mpeg" length="12345"/>
      <itunes:duration>1:23:45</itunes:duration>
      <itunes:episode>1</itunes:episode>
      <description>First episode description.</description>
    </item>
    """)
    episodes = parse_feed(rss)
    assert len(episodes) == 1
    ep = episodes[0]
    assert ep["id"] == "ep-1"
    assert ep["title"] == "#1: The First Riddle"
    assert ep["episode_number"] == 1
    assert ep["duration"] == 1 * 3600 + 23 * 60 + 45
    assert ep["audio_url"] == "https://example.com/ep1.mp3"
    assert ep["description"] == "First episode description."
    assert ep["pub_date"] > 0


def test_parse_feed_itunes_tags_in_tags_list():
    # Some feedparser builds expose iTunes tags in the generic tags list.
    rss = _make_rss("""
    <item>
      <guid>ep-2</guid>
      <title>Bonus: Extra</title>
      <pubDate>Tue, 02 Jan 2024 00:00:00 GMT</pubDate>
      <enclosure url="https://example.com/ep2.mp3" type="audio/mpeg" length="12345"/>
      <category label="itunes_duration">45:00</category>
      <category label="itunes_episode">2</category>
      <category label="itunes_image">https://example.com/cover.jpg</category>
    </item>
    """)
    episodes = parse_feed(rss)
    assert len(episodes) == 1
    ep = episodes[0]
    assert ep["episode_number"] == 2
    assert ep["duration"] == 45 * 60
    assert ep["image_url"] == "https://example.com/cover.jpg"


def test_parse_feed_prefers_content_over_summary():
    rss = _make_rss("""
    <item>
      <guid>ep-3</guid>
      <title>#3: Content Test</title>
      <pubDate>Wed, 03 Jan 2024 00:00:00 GMT</pubDate>
      <enclosure url="https://example.com/ep3.mp3" type="audio/mpeg" length="12345"/>
      <content:encoded xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <![CDATA[<p>Rich content</p>]]>
      </content:encoded>
      <description>Plain summary</description>
    </item>
    """)
    episodes = parse_feed(rss)
    assert len(episodes) == 1
    assert "Rich content" in episodes[0]["description"]


def test_parse_feed_empty_content_list():
    # feedparser may return an empty content list; ensure no IndexError.
    rss = _make_rss("""
    <item>
      <guid>ep-4</guid>
      <title>#4: Empty Content</title>
      <pubDate>Thu, 04 Jan 2024 00:00:00 GMT</pubDate>
      <enclosure url="https://example.com/ep4.mp3" type="audio/mpeg" length="12345"/>
      <content:encoded xmlns:content="http://purl.org/rss/1.0/modules/content/"></content:encoded>
      <description>Fallback summary</description>
    </item>
    """)
    episodes = parse_feed(rss)
    assert len(episodes) == 1
    assert episodes[0]["description"] == "Fallback summary"


def test_parse_feed_skips_entries_without_audio():
    rss = _make_rss("""
    <item>
      <guid>no-audio</guid>
      <title>No Audio</title>
      <pubDate>Fri, 05 Jan 2024 00:00:00 GMT</pubDate>
      <description>No enclosure here.</description>
    </item>
    <item>
      <guid>with-audio</guid>
      <title>Has Audio</title>
      <pubDate>Fri, 05 Jan 2024 00:00:00 GMT</pubDate>
      <enclosure url="https://example.com/ep5.mp3" type="audio/mpeg" length="12345"/>
    </item>
    """)
    episodes = parse_feed(rss)
    assert len(episodes) == 1
    assert episodes[0]["id"] == "with-audio"


def test_parse_duration_variants():
    assert parse_duration("1:23:45") == 1 * 3600 + 23 * 60 + 45
    assert parse_duration("45:30") == 45 * 60 + 30
    assert parse_duration("123") == 123
    assert parse_duration("1:23:45.500") == 1 * 3600 + 23 * 60 + 45
    assert parse_duration(None) is None
    assert parse_duration("") is None
    assert parse_duration("not-a-duration") is None


def test_parse_episode_number_variants():
    assert parse_episode_number("#42: Title", None) == 42
    assert parse_episode_number("42: Title", None) == 42
    assert parse_episode_number("Bonus: Title", None) is None
    assert parse_episode_number("Title", "7") == 7
    assert parse_episode_number("Title", "not-a-number") is None


@pytest.mark.asyncio
async def test_fetch_feed_and_parse_mocked(httpx_mock):
    rss = _make_rss("""
    <item>
      <guid>fetched</guid>
      <title>#5: Fetched</title>
      <pubDate>Sat, 06 Jan 2024 00:00:00 GMT</pubDate>
      <enclosure url="https://example.com/ep5.mp3" type="audio/mpeg" length="12345"/>
    </item>
    """)
    httpx_mock.add_response(url="https://example.com/feed.xml", text=rss)

    from backend.rss import fetch_and_parse
    episodes = await fetch_and_parse("https://example.com/feed.xml")
    assert len(episodes) == 1
    assert episodes[0]["id"] == "fetched"
