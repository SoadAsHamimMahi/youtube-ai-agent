const axios = require("axios");

const API_KEY = process.env.YOUTUBE_API_KEY;
const BASE_URL = "https://www.googleapis.com/youtube/v3";

// Topics to search for
const SEARCH_QUERIES = [
  "AI agent tutorial",
  "AI app development",
  "AI game development",
  "AI automation tools",
  "build app using AI",
  "no code AI agent",
];

/**
 * Returns an ISO 8601 timestamp for 48 hours ago (UTC).
 */
function get48HoursAgoTimestamp() {
  const date = new Date();
  date.setHours(date.getHours() - 48);
  return date.toISOString();
}

/**
 * Searches YouTube for a single query and returns raw video items.
 * Uses order=date and filters to the last 48 hours.
 */
async function searchVideos(query, publishedAfter) {
  const url = `${BASE_URL}/search`;
  const response = await axios.get(url, {
    params: {
      key: API_KEY,
      q: query,
      part: "snippet",
      type: "video",
      order: "date",
      maxResults: 50,
      publishedAfter,
    },
  });
  return response.data.items;
}

/**
 * Fetches view count statistics for a batch of video IDs.
 */
async function fetchVideoStats(videoIds) {
  const url = `${BASE_URL}/videos`;
  const response = await axios.get(url, {
    params: {
      key: API_KEY,
      id: videoIds.join(","),
      part: "statistics,snippet",
    },
  });
  return response.data.items;
}

/**
 * Main function: searches all queries, deduplicates, fetches stats,
 * sorts by viewCount descending, and returns the top 10 videos.
 */
async function getTopAIVideos() {
  const publishedAfter = get48HoursAgoTimestamp();
  console.log(`🔍 Searching for videos published after: ${publishedAfter}`);

  // Step 1: Fetch all search results in parallel
  const allSearchResults = await Promise.all(
    SEARCH_QUERIES.map((q) => {
      console.log(`   → Query: "${q}"`);
      return searchVideos(q, publishedAfter);
    })
  );

  // Step 2: Flatten all results into a single array
  const flatResults = allSearchResults.flat();

  // Step 3: Deduplicate by videoId
  const seen = new Set();
  const uniqueVideos = flatResults.filter((item) => {
    const id = item.id.videoId;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  console.log(
    `✅ Found ${flatResults.length} total results → ${uniqueVideos.length} unique videos after dedup`
  );

  // Step 4: Fetch statistics for all unique videos (in batches of 50)
  const videoIds = uniqueVideos.map((v) => v.id.videoId);
  const batchSize = 50;
  const statsBatches = [];
  for (let i = 0; i < videoIds.length; i += batchSize) {
    const batch = videoIds.slice(i, i + batchSize);
    const stats = await fetchVideoStats(batch);
    statsBatches.push(...stats);
  }

  // Step 5: Build enriched video objects with viewCount
  const enriched = statsBatches.map((item) => {
    const viewCount = parseInt(item.statistics?.viewCount || "0", 10);
    return {
      videoId: item.id,
      title: item.snippet.title,
      channelName: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
      thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
      url: `https://www.youtube.com/watch?v=${item.id}`,
      viewCount,
    };
  });

  // Step 6: Sort by viewCount descending and take top 10
  const top10 = enriched
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, 10);

  console.log(`🏆 Top 10 videos by view count selected.`);
  return top10;
}

module.exports = { getTopAIVideos };
