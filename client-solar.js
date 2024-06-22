#!/usr/bin/node
let
    cfg = {                         // use file's name for service name<____-----------------------------------
        moduleName: "Solar",           // give this NodeJS Client a name for notification
        workingDir: "/apps/tw/",
        telegram: {                         // delete this object if you don't use Tekegram
            password: "password",           // password for telegram registration
        },
        ha: [                               // add all your home assistant entities here
            "input_boolean.auto_inverter",
            "input_boolean.auto_solar",
            "input_boolean.auto_compressor",
            "input_boolean.auto_lth_uth",
        ],
        esp: [                              // add all your ESP entities here
            "dc1-volts",
            "battery-relay1",   // inverter 8.2kw
            "battery-relay2",
            "battery-relay3",
            "battery-relay4",   // fan 
            "ac1-power",        // inverter watts
            "ac1-energy",       // inverter energy
            "ac2-voltage",      // grid voltage
            "ac2-power",        // grid watts
            "ac2-energy",       // grid kwh
            "sunlight",
            "temp-room",
            "lth-relay1",       // compressor
            "uth-relay1",       // compressor
        ],
        grid: {
            espVoltage: 7,
            espPower: 8,
        },
        solar: {
            haAutomation: 1,
            espSunlight: 10,
            p1sunlightOn: 2.5,
            p1sunlightOff: 2.2,
            p1batVoltageOn: 53.5,
            p1batVoltageOff: 53.2,
            p1HA: [2],
        },
        inverter: [
            {
                name: "farmhouse",
                haAutomation: 0,
                espSwitch: 3,
                espVoltage: 0,
                espPower: 5,
                espFan: 2,              // equipment room fan
                voltsRun: 53.0,
                voltsStop: 51.4,
                welderWatts: 4000,      // high loads detected
                welderTimeout: 240      // time in seconds
            },
        ],
    },
    automation = [                                                          // create an (index, clock) => {},  array member function for each automation 
        (index, clock) => {                                       // sync the time.  time.sec time.min are global vars containing epoch time  
            if (state.auto[index] == undefined) init();
            let st = state.auto[index];                                     // set automation state object's shorthand name to "st" (state) 
            function init() {
                state.auto.push({                                           // create object for this automation, 
                    name: "Solar",                                          // give this automation a name 
                    inverter: { state: null, step: time.sec },
                    grid: { state: null, step: time.sec },

                    welder: false,
                    welderStep: null,
                    pumper: {
                        priority1run: null,
                    }
                });
                setInterval(() => { automation[index](index); }, 1e3);      // set minimum rerun time, otherwise this automation function will only on ESP and HA events
                emitters();
                log("automation system started", index, 1);                 // log automation start with index number and severity 
                send("sensor", { sensorReg: true });
            }
            welderDetection();
            gridDetection();
            inverterAuto();     // inverterAuto calls solarAutomation
            /*
            if on grid during blackout, switch to inverter if under certain voltage

            priority 2 - run pump from grid if at critical level
            runs pumps for 1hr every 24hours if at critical level 20%

            why do both pump and solar have telegram user list but im only one pumper but get solar also???
            */
            function solarAutomation() {

                if (state.esp[cfg.solar.espSunlight] >= cfg.solar.p1sunlightOn
                    && state.esp[cfg.inverter[0].espVoltage] >= cfg.solar.p1batVoltageOn) {
                    if (st.pumper.priority1run == false || st.pumper.priority1run == null) {
                        log("Sun is high (" + state.esp[cfg.solar.espSunlight].toFixed(2) + "v) - starting priority 1 devices", index, 1);
                        st.pumper.priority1run = true;
                        ha.send("input_boolean.auto_compressor", true);
                        //                      ha.send("input_boolean.auto_lth_uth", true);
                    }
                }
                if (state.esp[cfg.solar.espSunlight] <= cfg.solar.p1sunlightOff
                    || state.esp[cfg.inverter[0].espVoltage] <= cfg.solar.p1batVoltageOff) {
                    if (st.pumper.priority1run == true || st.pumper.priority1run == null) {
                        log("Sun is low (" + state.esp[cfg.solar.espSunlight].toFixed(2) + "v) - stopping priority 1 devices", index, 1);
                        st.pumper.priority1run = false;
                        ha.send("input_boolean.auto_compressor", false);
                        ha.send("input_boolean.auto_lth_uth", false);
                        esp.send("uth-relay1", false);
                    }
                }
            }
            function welderDetection() {
                if (state.esp[cfg.inverter[0].espPower] >= cfg.inverter[0].welderWatts ||  // check inverter meter
                    state.esp[cfg.grid.espPower] >= cfg.inverter[0].welderWatts) {           // check grid meter
                    st.welderStep = time.sec;                   // extend welter timeout if still heavy loads
                    if (st.welder == false) {
                        log("welder detected: " + state.esp[cfg.inverter[0].espPower].toFixed() + "w - shutting down all pumps", index, 2);
                        st.welder = true;
                        st.pumper.priority1run = false;
                        ha.send("input_boolean.auto_compressor", false);
                        ha.send("input_boolean.auto_lth_uth", false);
                        //    esp.send("uth-relay1", false);
                        // turn on fan
                    }
                } else {
                    if (st.welder == true && time.sec - st.welderStep >= cfg.inverter[0].welderTimeout) {
                        log("welder not detected: " + state.esp[cfg.inverter[0].espPower].toFixed() + "w", index, 1);
                        st.welder = false;
                    }
                }
            }
            function inverterAuto() {
                if (st.inverter.state == null) {                // if inverter state is unknown
                    if (state.esp[cfg.inverter[0].espSwitch] === true || state.esp[cfg.inverter[0].espSwitch] === false) {
                        log("initializing inverter state - current state: " + state.esp[cfg.inverter[0].espSwitch], index, 1);
                        log("Battery Voltage: " + state.esp[cfg.inverter[0].espVoltage].toFixed(1), index, 1);
                        st.inverter.state = state.esp[cfg.inverter[0].espSwitch];
                        st.inverter.step = time.sec;
                        if (state.ha[cfg.inverter[0].haAutomation] == true) log("inverter automation is on", index, 1);
                        else log("inverter automation is off", index, 1);
                    }
                } else {                                        // if inverter state is known
                    if (state.ha[cfg.inverter[0].haAutomation] == true) {
                        if (st.inverter.state == true) {        // if inverter is already on
                            if (state.esp[cfg.inverter[0].espVoltage] <= cfg.inverter[0].voltsStop) {   // when battery is low
                                log("Battery is low: " + state.esp[cfg.inverter[0].espVoltage].toFixed(1) + ", switching to grid ", index, 2);
                                st.inverter.state = false;
                                esp.send(cfg.esp[cfg.inverter[0].espSwitch], false)
                            }
                            if (state.ha[cfg.solar.haAutomation] == true && st.welder == false) solarAutomation(); // run whenever inverter auto is enabled
                        } else {
                            if (state.esp[cfg.inverter[0].espVoltage] >= cfg.inverter[0].voltsRun) {  // when battery begins to charge
                                log("Battery is charging: " + state.esp[cfg.inverter[0].espVoltage].toFixed(1) + ", switching to solar ", index, 2);
                                esp.send(cfg.esp[cfg.inverter[0].espSwitch], true)
                                st.inverter.state = true;
                            }
                        }
                    }
                }
            }
            function gridDetection() {
                if (state.esp[cfg.grid.espVoltage] == null) {   // when grid is offline
                    if (st.grid.state == true) {
                        log("grid blackout", index, 2);
                        st.grid.state = false;
                        st.grid.step = time.sec;                // grid statistics , save to nv
                        ha.send("voltage_grid", 0, "v");
                    }
                } else {
                    if (st.grid.state == null) {
                        log("grid is online", index, 1);
                        ha.send("voltage_grid", state.esp[cfg.grid.espVoltage].toFixed(0), "v");
                        st.grid.state = true;
                    }
                    if (st.grid.state == false) {
                        // global function to give h m s?
                        // log grid blackout statistics
                        // log sunlight daily index
                        log("grid back online, offline for: " + time.sec - st.grid.step + "s", index, 2);
                        st.grid.state = true;
                        ha.send("voltage_grid", 0, "v");
                    }
                }
            }
            if (clock) {
                var day = clock.day, dow = clock.dow, hour = clock.hour, min = clock.min;
                if (hour == 18 && min == 0) { }
            };
            function emitters() {
                em.on(cfg.esp[cfg.inverter[0].espSwitch], (newState) => {
                    log("inverter state changed in HA - new state: " + state.esp[cfg.inverter[0].espSwitch], index, 1);
                    st.inverter.state = newState;
                });
            }
        }
    ];
let
    user = {        // user configurable block - Telegram 
        telegram: { // enter a case matching your desireable input
            agent: function (msg) {
                //  log("incoming telegram message: " + msg, 0, 0);
                //  console.log("incoming telegram message: ", msg);
                if (telegram.auth(msg)) {
                    switch (msg.text) {
                        case "?": console.log("test help menu"); break;
                        case "/start": bot(msg.chat.id, "you are already registered"); break;
                        case "R":   // to include uppercase letter in case match, we put no break between upper and lower cases
                        case "r":
                            bot(msg.from.id, "Test Menu:");
                            setTimeout(() => {      // delay to ensure menu Title gets presented first in Bot channel
                                telegram.buttonToggle(msg, "t1", "Test Button");
                                setTimeout(() => {      // delay to ensure menu Title gets presented first in Bot channel
                                    telegram.buttonMulti(msg, "t2", "Test Choices", ["test1", "test2", "test3"]);
                                }, 200);
                            }, 200);
                            break;
                        default:
                            log("incoming telegram message - unknown command - " + JSON.stringify(msg.text), 0, 0);
                            break;
                    }
                }
                else if (msg.text == cfg.telegram.password) telegram.sub(msg);
                else if (msg.text == "/start") bot(msg.chat.id, "give me the passcode");
                else bot(msg.chat.id, "i don't know you, go away");

            },
            response: function (msg) {  // enter a two character code to identify your callback "case" 
                let code = msg.data.slice(0, 2);
                let data = msg.data.slice(2);
                switch (code) {
                    case "t1":  // read button input and toggle corresponding function
                        if (data == "true") { myFunction(true); break; }
                        if (data == "false") { myFunction(false); break; }
                        break;
                    case "t2":  // read button input and perform actions
                        switch (data) {
                            case "test1": bot.sendMessage(msg.from.id, log("test1", "Telegram", 0)); break;
                            case "test2": bot.sendMessage(msg.from.id, log("test2", "Telegram", 0)); break;
                            case "test3": bot.sendMessage(msg.from.id, log("test3", "Telegram", 0)); break;
                        }
                        break;
                }       // create a function for use with your callback
                function myFunction(newState) {    // function that reads the callback input and toggles corresponding boolean in Home Assistant
                    bot.sendMessage(msg.from.id, "Test State: " + newState);
                }
            },
        },
    },
    sys = {
        com: function () {
            udp.on('message', function (data, info) {
                time.sync();   // sync the time.  time.sec time.min are global vars containing epoch time  
                let buf = JSON.parse(data);
                if (buf.type != "async") {
                    //  console.log(buf);
                    switch (buf.type) {
                        case "espState":      // incoming state change (from ESP)
                            // console.log("receiving esp data, ID: " + buf.obj.id + " state: " + buf.obj.state);
                            state.onlineESP = true;
                            // if (buf.obj.id == 0) { state.esp[buf.obj.id] = 1.0; }
                            state.esp[buf.obj.id] = buf.obj.state;
                            if (state.online == true) {
                                em.emit(cfg.esp[buf.obj.id], buf.obj.state);
                                automation.forEach((func, index) => { if (state.auto[index]) func(index) });
                            }
                            break;
                        case "haStateUpdate":       // incoming state change (from HA websocket service)
                            log("receiving state data, entity: " + cfg.ha[buf.obj.id] + " value: " + buf.obj.state, 0);
                            //         console.log(buf);
                            try { state.ha[buf.obj.id] = buf.obj.state; } catch { }
                            if (state.online == true) {
                                em.emit(cfg.ha[buf.obj.id], buf.obj.state);
                                automation.forEach((func, index) => { if (state.auto[index]) func(index) });
                            }
                            break;
                        case "haFetchReply":        // Incoming HA Fetch result
                            state.ha = (buf.obj);
                            log("receiving fetch data: " + state.ha);
                            state.onlineHA = true;
                            automation.forEach((func, index) => { func(index) });
                            break;
                        case "haFetchAgain":        // Core is has reconnected to HA, so do a refetch
                            state.ha = (buf.obj);
                            log("Core has reconnected to HA, fetching again");
                            send("espFetch");
                            break;
                        case "haQueryReply":        // HA device query
                            console.log("Available HA Devices: " + buf.obj);
                            break;
                        case "udpReRegister":       // reregister request from server
                            log("server lost sync, reregistering...");
                            setTimeout(() => {
                                sys.register();
                                if (cfg.ha != undefined) { send("haFetch"); }
                            }, 1e3);
                            break;
                        case "sensor":
                            exist = false;
                            sensorNum = null;
                            for (let x = 0; x < state.sensor.length; x++) {
                                if (state.sensor[x].name == buf.obj.name) {      // a client is sending sensor data for the first time
                                    state.sensor[x].value = buf.obj.value;
                                    state.sensor[x].unit = buf.obj.unit;
                                    exist = true;
                                    break;
                                }
                            }
                            if (exist == false) {
                                sensorNum = state.sensor.push({ name: buf.obj.name, value: buf.obj.value, unit: buf.obj.unit }) - 1;
                                log("sensor:" + sensorNum + " - is registering: " + buf.obj.name + " - " + buf.obj.value + " " + buf.obj.unit);
                            }
                            break;
                        case "diag":                // incoming diag refresh request, then reply object
                            send("diag", { state: state, nv: nv, test: "test" });
                            break;
                        case "telegram":
                            switch (buf.obj.class) {
                                case "agent":
                                    user.telegram.agent(buf.obj.data);
                                    break;
                            }
                            break;
                        case "timer":
                            let timeBuf = { day: buf.obj.day, dow: buf.obj.dow, hour: buf.obj.hour, min: buf.obj.min };
                            if (state.online == true) {
                                automation.forEach((func, index) => { if (state.auto[index]) func(index, timeBuf) });
                            }
                            break;
                        case "log": console.log(buf.obj); break;
                    }
                }
            });
        },
        register: function () {
            log("registering with TW-Core");
            let obj = {};
            if (cfg.ha != undefined) obj.ha = cfg.ha;
            if (cfg.esp != undefined) obj.esp = cfg.esp;
            if (cfg.telegram != undefined) obj.telegram = true;
            send("register", obj, cfg.moduleName);
            if (nv.telegram != undefined) {
                log("registering telegram users with TW-Core");
                for (let x = 0; x < nv.telegram.length; x++) {
                    send("telegram", { class: "sub", id: nv.telegram[x].id });
                }
            }
        },
        init: function () {
            nv = {};
            state = { auto: [], ha: [], esp: [], sensor: [], onlineHA: false, onlineESP: false, online: false };
            time = {
                sec: null, min: null,
                sync: function () {
                    this.sec = Math.floor(Date.now() / 1000);
                    this.min = Math.floor(Date.now() / 1000 / 60);
                }
            };
            esp = { send: function (name, state) { send("espState", { name: name, state: state }) } };
            ha = {
                getEntities: function () { send("haQuery") },
                send: function (name, state, unit, id) {  // if ID is not expressed for sensor, then sensor data will be send to HA system 0
                    if (isFinite(Number(name)) == true) send("haState", { name: cfg.ha[name], state: state, unit: unit, haID: id });
                    else send("haState", { name: name, state: state, unit: unit, haID: id });
                }
            };
            fs = require('fs');
            events = require('events');
            em = new events.EventEmitter();
            exec = require('child_process').exec;
            execSync = require('child_process').execSync;
            workingDir = require('path').dirname(require.main.filename);
            path = require('path');
            scriptName = path.basename(__filename).slice(0, -3);
            udpClient = require('dgram');
            udp = udpClient.createSocket('udp4');
            if (process.argv[2] == "-i") {
                moduleName = cfg.moduleName.toLowerCase();
                log("installing TW-Client-" + cfg.moduleName + " service...");
                let service = [
                    "[Unit]",
                    "Description=\n",
                    "[Install]",
                    "WantedBy=multi-user.target\n",
                    "[Service]",
                    "ExecStart=nodemon " + cfg.workingDir + "client-" + moduleName + ".js -w " + cfg.workingDir + "client-" + moduleName + ".js --exitcrash",
                    "Type=simple",
                    "User=root",
                    "Group=root",
                    "WorkingDirectory=" + cfg.workingDir,
                    "Restart=on-failure",
                    "RestartSec=10\n",
                ];
                fs.writeFileSync("/etc/systemd/system/tw-client-" + moduleName + ".service", service.join("\n"));
                // execSync("mkdir /apps/ha -p");
                // execSync("cp " + process.argv[1] + " /apps/ha/");
                execSync("systemctl daemon-reload");
                execSync("systemctl enable tw-client-" + moduleName + ".service");
                execSync("systemctl start tw-client-" + moduleName);
                execSync("service tw-client-" + moduleName + " status");
                log("service installed and started");
                console.log("type: journalctl -fu tw-client-" + moduleName);
                process.exit();
            }
            if (process.argv[2] == "-u") {
                moduleName = cfg.moduleName.toLowerCase();
                log("uninstalling TW-Client-" + cfg.moduleName + " service...");
                execSync("systemctl stop tw-client-" + moduleName);
                execSync("systemctl disable tw-client-" + moduleName + ".service");
                fs.unlinkSync("/etc/systemd/system/tw-client-" + moduleName + ".service");
                console.log("TW-Client-" + cfg.moduleName + " service uninstalled");
                process.exit();
            }
            file = {
                write: {
                    nv: function () {  // write non-volatile memory to the disk
                        // log("writing NV data...")
                        fs.writeFile(workingDir + "/nv-" + scriptName + "-bak.json", JSON.stringify(nv), function () {
                            fs.copyFile(workingDir + "/nv-" + scriptName + "-bak.json", workingDir + "/nv-" + scriptName + ".json", (err) => {
                                if (err) throw err;
                            });
                        });
                    }
                },
            };
            telegram = {
                sub: function (msg) {
                    let buf = { user: msg.from.first_name + " " + msg.from.last_name, id: msg.from.id }
                    if (!telegram.auth(msg)) {
                        log("telegram - user just joined the group - " + msg.from.first_name + " " + msg.from.last_name + " ID: " + msg.from.id, 0, 2);
                        nv.telegram.push(buf);
                        bot(msg.chat.id, 'registered');
                        send("telegram", { class: "sub", id: msg.from.id });
                        file.write.nv();
                    } else bot(msg.chat.id, 'already registered');
                },
                auth: function (msg) {
                    let exist = false;
                    for (let x = 0; x < nv.telegram.length; x++)
                        if (nv.telegram[x].id == msg.from.id) { exist = true; break; };
                    if (exist) return true; else return false;
                },
                buttonToggle: function (msg, auto, name) {
                    bot(msg.from.id,
                        name, {
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: "on", callback_data: (auto + "true") },
                                    { text: "off", callback_data: (auto + "false") }
                                ]
                            ]
                        }
                    }
                    );
                },
                buttonMulti: function (msg, auto, name, array) {
                    buf = { reply_markup: { inline_keyboard: [[]] } };
                    array.forEach(element => {
                        buf.reply_markup.inline_keyboard[0].push({ text: element, callback_data: (auto + element) })
                    });
                    bot(msg.from.id, name, buf);
                },
            };
            sys.boot(0);
        },
        boot: function (step) {
            switch (step) {
                case 0:
                    moduleName = cfg.moduleName.toLowerCase();
                    console.log("Loading non-volatile data...");
                    fs.readFile(workingDir + "/nv-" + scriptName + ".json", function (err, data) {
                        if (err) {
                            log("\x1b[33;1mNon-Volatile Storage does not exist\x1b[37;m"
                                + ", nv-clientName.json file should be in same folder as client.js file");
                            nv = { telegram: [] };
                        }
                        else { nv = JSON.parse(data); }
                        sys.boot(1);
                    });
                    break;
                case 1:
                    sys.com();
                    sys.register();
                    setTimeout(() => { sys.boot(2); }, 3e3);
                    break;
                case 2:
                    state.online = true;
                    setInterval(() => { send("heartBeat") }, 1e3);
                    if (cfg.ha) { send("haFetch"); confirmHA(); }
                    else setTimeout(() => { automation.forEach((func, index) => { func(index) }); }, 1e3);
                    if (cfg.esp) {
                        if (!cfg.ha) confirmESP();
                        send("espFetch");
                    }
                    function confirmHA() {
                        setTimeout(() => {
                            if (state.onlineHA == false) {
                                log("TW-Core isn't online yet or fetch is failing, retrying...", 2);
                                sys.register();
                                send("haFetch");
                                confirmHA();
                            }
                        }, 10e3);
                    }
                    function confirmESP() {
                        setTimeout(() => {
                            if (state.onlineESP == false) {
                                log("TW-Core isn't online yet or fetch is failing, retrying...", 2);
                                send("espFetch");
                                confirmESP();
                            }
                        }, 10e3);
                    }
                    break;
            }
        },
    };
setTimeout(() => { sys.init(); }, 1e3);
function bot(id, data, obj) { send("telegram", { class: "send", id: id, data: data, obj: obj }) }
function send(type, obj, name) { udp.send(JSON.stringify({ type: type, obj: obj, name: name }), 65432, '127.0.0.1') }
function log(message, index, level) {
    if (level == undefined) send("log", { message: message, mod: cfg.moduleName, level: index });
    else send("log", { message: message, mod: state.auto[index].name, level: level });
}
