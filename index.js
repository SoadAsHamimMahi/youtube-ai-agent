require("dotenv").config();

const { getTopAIVideos } = require("./services/youtube");
const { sendEmail } = require("./services/mail");

async function main() {
  console.log("🚀 YouTube AI Monitor — Starting daily run...");
  console.log("=".repeat(50));

  try {
    // Step 1: Fetch top AI videos from the last 48 hours
    const videos = await getTopAIVideos();

    if (!videos || videos.length === 0) {
      console.log("⚠️  No videos found. Skipping email send.");
      return;
    }

    console.log(`\n📊 Top ${videos.length} videos ready to send:\n`);
    videos.forEach((v, i) => {
      console.log(`  ${i + 1}. [${v.viewCount.toLocaleString()} views] ${v.title}`);
    });

    // Step 2: Send the HTML email report
    console.log("\n📤 Sending email report...");
    await sendEmail(videos);

    console.log("\n✅ Daily run complete!");
    console.log("=".repeat(50));
  } catch (error) {
    console.error("\n❌ Error during daily run:");
    console.error(error.message || error);
    process.exit(1);
  }
}

main();
