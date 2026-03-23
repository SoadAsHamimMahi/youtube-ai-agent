const axios = require("axios");

const API_KEY = process.env.YOUTUBE_API_KEY;
const BASE_URL = "https://www.googleapis.com/youtube/v3";

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
 */
async function searchVideos(query, publishedAfter) {
  const url = `${BASE_URL}/search`;
  try {
    const response = await axios.get(url, {
      params: {
        key: API_KEY,
        q: query,
        part: "snippet",
        type: "video",
        order: "viewCount",
        maxResults: 25,
        publishedAfter,
      },
    });
    return response.data.items || [];
  } catch (error) {
    console.error(`   ❌ Failed search for "${query}":`, error.response?.data?.error?.message || error.message);
    return [];
  }
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
 * Main function: searches queries, deduplicates, fetches stats,
 * and returns top N videos.
 */
async function getTopAIVideos(queries, maxResults = 10) {
  const publishedAfter = get48HoursAgoTimestamp();
  console.log(`🔍 Searching for videos published after: ${publishedAfter}`);

  // Step 1: Fetch all search results in parallel
  const allSearchResults = await Promise.all(
    queries.map((q) => {
      console.log(`   → Query: "${q}"`);
      return searchVideos(q, publishedAfter);
    })
  );

  // Step 2: Flatten and deduplicate
  const flatResults = allSearchResults.flat();
  const seen = new Set();
  const uniqueVideos = flatResults.filter((item) => {
    if (!item.id || !item.id.videoId) return false;
    const id = item.id.videoId;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  // Step 3: Fetch Stats
  const videoIds = uniqueVideos.map((v) => v.id.videoId);
  const batchSize = 50;
  const statsBatches = [];
  for (let i = 0; i < videoIds.length; i += batchSize) {
    const batch = videoIds.slice(i, i + batchSize);
    const stats = await fetchVideoStats(batch);
    statsBatches.push(...stats);
  }

  // Step 4: Build enriched objects
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

  // Step 5: Sort and slice
  return enriched
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, maxResults);
}

module.exports = { getTopAIVideos };
