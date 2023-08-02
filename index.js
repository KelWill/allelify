const chalk = require("chalk");

[("uncaughtException", "unhandledRejection")].forEach((badThing) => {
  process.on(badThing, (err) => {
    console.error(chalk.red(badThing, err, err.stack));
  });
});

const timerHoldingProcessOpen = setInterval(() => {
  // do nothing
}, 1 << 30);

const fs = require("fs");

const Spinnies = require("spinnies");

const { spawn } = require("child_process");
const path = require("path");

const logsByProcess = {};
const failures = [];

function logFailures() {
  spinnies.stopAll();
  for (const failure of failures) {
    console.log(`\n——————————${failure}——————————\n`);
    console.log((logsByProcess[failure] || []).join("\n"));
  }
}
const spinnies = new Spinnies();

const HELP_TEXT = `## Usage

require("allelify")([
    "make test",
    {
        title: "lint", // overrides lint
        command: "make lint",
    },
    {
        title: "snarglify",
        command: "ag",
        args: ["-l", "build steps"], // args is necessary when arguments have spaces
    },
], { tmpDirectory: path.join(__dirname, "../tmp") });

If you've installed this globally using \`npm install -g allelify\`, you can run things in parallel on the command line:  \`allelify 'sleep 1' 'sleep 2'\`
`;

// there's probably a better way of doing this—just want a reasonable date string for a file name
function getDateTimestampForFilename(d = new Date()) {
  return new Date().toISOString().replace(/[-:\/.]/g, "_");
}

module.exports = function runCommandsInParallel(commands, config = {}) {
  return new Promise((resolve, reject) => {
    let hasPromiseFinalized = false;
    function logErrorAndRejrect(msg, err) {
      spinnies.stopAll();
      console.error(
        err ?? new Error(msg),
        `\n${chalk.red(msg)}`,
        `\n\n${HELP_TEXT}\n`
      );

      if (!hasPromiseFinalized) {
        reject(err || new Error(msg));
        hasPromiseFinalized = true;
      }
    }

    const tmpDirectory = config.tmpDirectory ?? "/tmp";
    try {
      fs.statSync(tmpDirectory);
    } catch (err) {
      return logErrorAndRejrect(`Unable to stat ${tmpDirectory}`, err);
    }
    const sharedTimestamp = getDateTimestampForFilename();

    let running = 0;
    for (const commandObj of commands) {
      let command;
      let title;
      let args;
      if (typeof commandObj === "string") {
        title = commandObj;
        [command, ...args] = (commandObj ?? "").split(" ");
      } else if (commandObj.args) {
        title = commandObj.title;
        command = commandObj.command;
        args = commandObj.args;
      } else {
        title = commandObj.title;
        [command, ...args] = (commandObj.command ?? "").split(" ");
      }

      if (!title || !command) {
        return logErrorAndRejrect("Missing required title or command");
      }

      const p = path.join(
        tmpDirectory,
        `${sharedTimestamp}-${title}-command.log`.replace(/[ \s:/]/g, "_")
      );
      try {
        fs.writeFileSync(p, "", "utf-8"); // clear out any existing file
      } catch (err) {
        return logErrorAndRejrect(
          `Unable to write to ${p}. Try setting a different temporary directory for it to write command output to`,
          err
        );
      }
      const commandString = `${command} ${args}`;
      spinnies.add(title, { text: `${title}` });

      const writeStream = new fs.createWriteStream(p, "utf-8");
      running++;

      const subProcess = spawn(command, args, {
        stderr: writeStream,
        stdout: writeStream,
      })
        .on("error", (err) => {
          spinnies.fail(title, {
            text: `Unable to start ${title} — ${commandString}`,
          });
          console.error(err);
          throw err;
        })
        .on("close", (code) => {
          if (!code) {
            spinnies.succeed(title, { text: `${title}` });
          } else {
            failures.push(title);
            spinnies.fail(title, {
              text: `${title} failed. You can find the logs in ${p.toString()} and they will be logged out after all processes complete. To re-run the command run ${commandString}`,
            });
            process.exitCode = code;
          }
          running--;
          if (running === 0) {
            timerHoldingProcessOpen.unref();
            if (process.exitCode) {
              reject(new Error("Some commands errored"));
            } else {
              resolve();
            }
            logFailures();
          }
        });

      const addLog = (data) => {
        fs.appendFileSync(p, String(data) + "\n", "utf-8");
        logsByProcess[title] ??= [];
        logsByProcess[title].push(data);
      };
      subProcess.stderr.on("data", addLog);
      subProcess.stdout.on("data", addLog);
    }
  });
};
