const commander = require("commander");
const fs = require("fs");
const path = require("path");
const process = require("process");
const {exec, spawn} = require("child_process");
const newApp = require("./commands/new");
const startClient = require("./commands/start-client");
const startServer = require("./commands/start-server");
const startTest = require("./commands/test");
const generate = require("./commands/generate");
const chalk = require("chalk");
const autoUpgrade = require("./auto-upgrade");
const chokidar = require('chokidar');

const command = process.argv[2];
const isProduction = process.env.NODE_ENV === "production";

const IS_WINDOWS = process.platform === "win32";

commander
  .version(getVersion());

commander
  .command("new")
  .description("generate a new application")
  .arguments("<app_name>")
  .action(newApp);

commander
  .command("generate <container|component|reducer>")
  .description("generate a new container")
  .arguments("<name>")
  .action(generate);

commander
  .command("start")
  .description("start everything")
  .option("-T, --no_tests", "ignore test hook")
  .action((options) => startAll(options.no_tests));

commander
.command("test")
.description("start tests")
.action(() => spawnProcess("test"));

commander
  .command("build")
  .description("create production asset build")
  .action(() => startClient(true));

commander
  .command("start-client", null, {noHelp: true})
  .description("start client")
  .action(() => startClient(false));

commander
  .command("start-server", null, {noHelp: true})
  .description("start server")
  .action(startServer);

commander
  .command("start-test", null, {noHelp: true})
  .description("start test")
  .action(startTest);

commander.parse(process.argv);

function getVersion () {
  var packageFileContents = fs.readFileSync(path.join(__dirname, "..", "package.json"));
  var packageObject = JSON.parse(packageFileContents);
  return packageObject.version;
}

function spawnProcess (type) {
  var childProcess;
  var postFix = IS_WINDOWS ? ".cmd" : "";
  switch (type) {
    case "client":
      childProcess = spawn("gluestick" + postFix, ["start-client"], {stdio: "inherit", env: Object.assign({}, process.env)});
      break;
    case "server":
      childProcess = spawn("gluestick" + postFix, ["start-server"], {stdio: "inherit", env: Object.assign({}, process.env, {NODE_ENV: isProduction ? "production": "development-server"})});
      break;
    case "test":
      childProcess = spawn("gluestick" + postFix, ["start-test"], {stdio: "inherit", env: Object.assign({}, process.env, {NODE_ENV: isProduction ? "production": "development-test"})});
      break;
  }

  childProcess.on("error", function (data) { console.log(chalk.red(JSON.stringify(arguments))) });
  return childProcess;
}

async function startAll(withoutTests=false) {
  await autoUpgrade();

  var client = spawnProcess("client");
  var server = spawnProcess("server");

  // Start tests unless they asked us not to or we are in production mode
  if (!isProduction && !withoutTests) {
    var testProcess = spawnProcess("test");
  }

  // We do not want to watch for changes in production
  if (isProduction) return;

  var changedTimer;
  console.log("watching", process.cwd());
  chokidar.watch(['src/**/*', 'assets/**/*', 'Index.js'], {
    ignored: /[\/\\]\./,
    persistent: true
  }).on('all', function(event, path) {
    clearTimeout(changedTimer);
    changedTimer = setTimeout(function() {
      console.log(chalk.yellow("[change detected] restarting server…", path));
      if (IS_WINDOWS) {
        // child_process.kill proved to not work on Windows. The only way we
        // could get the child process to die was to use `taskkill`. We need to
        // kill the entire process tree so we use /T. This is also an
        // asynchronous task so we spawn the new server once we know it has
        // completed.
        exec(`taskkill /PID ${server.pid} /T /F`, () => {
          server = spawnProcess("server");
        });
      }
      else {
        // Unix systems are easier than windows, kill the process, spawn a new
        // one
        server.kill();
        server = spawnProcess("server");
      }
    }, 250);
  });
}

