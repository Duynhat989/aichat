const trafficCache = {};

let isStarted = false;

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

const traffic = (type = "aichat", next) => {
  const today = getToday();

  if (!trafficCache[today]) {
    trafficCache[today] = {
      aichat: 0,
      aiimage: 0,
      aivideo: 0,
      spellchecker: 0,
      summarize: 0,
      translate: 0,
      studyguide: 0,
    };
  }

  if (trafficCache[today][type] !== undefined) {
    trafficCache[today][type]++;
  }

  if (typeof next === "function") {
    next();
  }
};

// update DB mỗi 10s
async function updateTrafficToDB() {
  try {
    const entries = Object.entries(trafficCache);

    for (const [date, data] of entries) {

      console.log("Update:", date, data);
      // reset cache sau khi update
      trafficCache[date] = {
        aichat: 0,
        aiimage: 0,
        aivideo: 0,
        spellchecker: 0,
        summarize: 0,
        translate: 0,
        studyguide: 0,
      };
    }
  } catch (err) {
    console.error("Traffic update error:", err);
  }
}

function startTrafficWorker() {
  if (isStarted) return;

  isStarted = true;

  setInterval(() => {
    updateTrafficToDB();
  }, 10 * 1000);
}

startTrafficWorker();

module.exports = traffic;