#!/usr/bin/node
let
    cfg = {
        moduleName: "NewClientModule",      // give this NodeJS Client a name for notification
        telegram: {                         // delete this object if you don't use Tekegram
            password: "password",           // password for telegram registration
        },
        ha: [                               // add all your home assistant entities here
            "myHaEntity",                   // this index order is used for incoming state events and output calls as well (ie state.ha[0] etc...)
        ],
        esp: [                              // add all your ESP entities here
            "myEspEntity",                  // this index order is used for incoming state events and output calls as well (ie state.esp[0] etc...)
        ]
    },
    automation = [                                                          // create an (index, clock) => {},  array member function for each automation 
        (index, clock) => {
            time.sync();                                                    // sync the time.  time.sec time.min are global vars containing epoch time  
            if (!state.auto[index]) {         // this block gets run once
                state.auto.push({                                           // create object for this automation, 
                    name: "Auto-System",                                    // give it a name and 
                    fan: { started: false, step: time.sec, ha: {} }         // create an object for each of this automation's devices or features     
                });
                setInterval(() => { automation[index](index); }, 1e3);      // set minimum rerun time, otherwise this automation function will only on ESP and HA events
                log("system started", index, 1);                            // log automation start with index number and severity 
                em.on("state" + "input_button.test", () => button.test());  // create an event emitter for this entities like buttons that call a member function
            }
            let st = state.auto[index];                                     // set automation state object's shorthand name to "st" (state) 
            st.fan.ha = {                                                   // assign relevant HA entities for this device 
                state: state.ha[3], auto: state.ha[2]                       // assign relevant HA entity stats  
                , timeOn: state.ha[0], timeOff: state.ha[1]
            }
            let button = {
                test: function () {                                         // example object member function called by emitter
                    ha.send("switch.fan_exhaust_switch", false);
                    ha.send("input_boolean.fan_auto", true);
                    ha.send("switch.fan_bed_switch", false);
                    ha.send(0, false);                                      // you can call by the entity number as listed in the order in cfg.ha
                    ha.send(2, true);                                       // or you can call my the entity's ID name as listed in Home Assistant
                    ha.send(3, false);
                }
            };
            if (clock) {                                                    
                var day = clock.day, dow = clock.dow, hour = clock.hour, min = clock.min;
                if (hour == 18 && min == 0) {
                    log("turning on outside lights");
                    ha.send("switch.light_outside_switch", true);
                }
                if (hour == 22 && min == 0) {
                    log("turning off outside lights");
                    ha.send("switch.light_outside_switch", false);
                }
            };
        }
    ];
let
    sys = {
        boot: function (step) {
            switch (step) {
                case 0:
                    sys.lib();
                    console.log("Loading non-volatile data...");
                    fs.readFile(workingDir + "/nv-" + cfg.moduleName + ".json", function (err, data) {
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
                    sys.checkArgs();
                    sys.com();
                    sys.register();
                    setTimeout(() => { sys.boot(2); }, 3e3);
                    break;
                case 2:
                    state.online = true;
                    setInterval(() => { sys.heartBeat(); }, 1e3);
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
        lib: function () {
            fs = require('fs'),
                events = require('events'),
                em = new events.EventEmitter(),
                exec = require('child_process').exec,
                execSync = require('child_process').execSync,
                workingDir = require('path').dirname(require.main.filename),
                udpClient = require('dgram'),
                udp = udpClient.createSocket('udp4');
        },
        com: function () {
            udp.on('message', function (data, info) {
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
                            state.ha[buf.obj.id] = buf.obj.state;
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
        heartBeat: function () { send("heartBeat") },
        checkArgs: function () {
            if (process.argv[2] == "-i") {
                moduleName = path.basename(__filename).slice(0, -3);
                log("installing TW-Client-" + moduleName + " service...");
                let service = [
                    "[Unit]",
                    "Description=\n",
                    "[Install]",
                    "WantedBy=multi-user.target\n",
                    "[Service]",
                    "ExecStart=nodemon " + cfg.workingDir + "client-" + moduleName + ".js -w " + cfg.workingDir + "client-" + moduleName + ".js",
                    "Type=simple",
                    "User=root",
                    "Group=root",
                    "WorkingDirectory=" + cfg.workingDir,
                    "Restart=on-failure\n",
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
        },
        file: {
            write: {
                nv: function () {  // write non-volatile memory to the disk
                    // log("writing NV data...")
                    fs.writeFile(workingDir + "/nv-" + cfg.moduleName + "-bak.json", JSON.stringify(nv), function () {
                        fs.copyFile(workingDir + "/nv-" + cfg.moduleName + "-bak.json", workingDir + "/nv-" + cfg.moduleName + ".json", (err) => {
                            if (err) throw err;
                        });
                    });
                }
            },
        },
        telegram: {
            sub: function (msg) {
                let buf = { user: msg.from.first_name + " " + msg.from.last_name, id: msg.from.id }
                if (!sys.telegram.auth(msg)) {
                    log("telegram - user just joined the group - " + msg.from.first_name + " " + msg.from.last_name + " ID: " + msg.from.id, 0, 2);
                    nv.telegram.push(buf);
                    bot(msg.chat.id, 'registered');
                    send("telegram", { class: "sub", id: msg.from.id });
                    sys.file.write.nv();
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
        },
    },
    esp = { send: function (name, state) { send("espState", { name: name, state: state }) } },
    ha = {
        getEntities: function () { send("haQuery") },
        send: function (name, state, unit, id) {  // if ID is not expressed for sensor, then sensor data will be send to HA system 0
            if (isFinite(Number(name)) == true) send("haState", { name: cfg.ha[name], state: state, unit: unit, haID: id });
            else send("haState", { name: name, state: state, unit: unit, haID: id });
        }
    },
    state = { auto: [], ha: [], esp: [], onlineHA: false, onlineESP: false, online: false },
    time = {
        sec: null, min: null,
        sync: function () {
            this.sec = Math.floor(Date.now() / 1000);
            this.min = Math.floor(Date.now() / 1000 / 60);
        }
    },
    nv = {};
setTimeout(() => { sys.boot(0); }, 1e3);
function bot(id, data, obj) { send("telegram", { class: "send", id: id, data: data, obj: obj }) }
function send(type, obj, name) { udp.send(JSON.stringify({ type: type, obj: obj, name: name }), 65432, '127.0.0.1') }
function log(message, index, level) {
    if (level == undefined) send("log", { message: message, mod: cfg.moduleName, level: index });
    else send("log", { message: message, mod: state.auto[index].name, level: level });
}


