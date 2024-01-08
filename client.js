#!/usr/bin/node
let
    cfg = {
        moduleName: "NewClientModule",      // give this NodeJS Client a name for notification
        telegram: {
            password: "password",           // password for telegram registration 
        },
        ha: [                               // add all your home assistant entities here
            "myHaEntity",
        ],
        esp: [                              // add all your ESP entities here
            "myEspEntity",
        ]
    },
    automation = [
        (index) => {
            let time = Math.floor(Date.now() / 1000 / 60)                   // set the epoch time for this function 
            if (!state.auto[index]) {                                       // this block gets run once
                state.auto.push({ name: "Auto-System", });                  // create object for this automation, give name
                setInterval(() => { automation[index](index); }, 1e3);      // set minimum rerun time, otherwise only on ESP and HA events
                log("system started", index, 1);                            // log automation start with index number and severity 
            }
            let st = state.auto[index];                                     // set automation state object's shorthand name to "st" (state) 
        },
    ];
let
    user = {        // user configurable block - Telegram and timer function.  
        timer: function (day, dow, hour, min) {    // these functions are called once every min,hour,day. Use time.min time.hour and time.day for comparison 
            if (hour == 18 && min == 0) {
                log("turning on outside lights");
                ha.state("switch.daren_light_outside_switch", true);
                ha.state("switch.jesmark_light_outside_switch", true);
            }
            if (hour == 0 && min == 0) {
                log("turning off outside lights");
                ha.state("switch.daren_light_outside_switch", false);
                ha.state("switch.jesmark_light_outside_switch", false);
            }
        },
        telegram: { // enter a case matching your desireable input
            agent: function (msg) {
         
            },
            response: function (msg) {  // enter a two character code to identify your callback "case" 
            },
        },
    },
    sys = {
        boot: function (step) {
            switch (step) {
                case 0:
                    sys.lib();
                    console.log("Loading non-volatile data...");
                    fs.readFile(workingDir + "/nv.json", function (err, data) {
                        if (err) {
                            log("\x1b[33;1mNon-Volatile Storage does not exist\x1b[37;m"
                                + "\nnv.json file should be in same folder as client.js file");
                            nv = { telegram: [] };
                        }
                        else { nv = JSON.parse(data); }
                    });
                    sys.checkArgs();
                    sys.com();
                    sys.register();
                    setInterval(() => { sys.heartBeat(); }, 1e3);
                    setTimeout(() => { sys.boot(1); }, 1e3);
                    break;
                case 1:
                    if (cfg.ha) { ha.fetch(); confirmFetch(); }
                    else setTimeout(() => { automation.forEach((func, index) => { func(index) }); }, 1e3);
                    function confirmFetch() {
                        setTimeout(() => {
                            if (state.online == false) {
                                log("TW-Core isn't online yet or fetch is failing, retrying...", 2);
                                ha.fetch();
                                confirmFetch();
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
                udpServer = require('dgram'),
                udp = udpServer.createSocket('udp4');
        },
        com: function () {
            udp.on('message', function (data, info) {
                let buf = JSON.parse(data);
                if (buf.type != "async") {
                    //  console.log(buf);
                    switch (buf.type) {
                        case "espStateUpdate":      // incoming state change (from ESP)
                            automation.forEach((func, index) => { if (state.auto[index]) func(index) });
                            //   console.log("receiving esp data, ID: " + buf.obj.id + " state: " + buf.obj.state);
                            state.esp[buf.obj.id] = buf.obj.state;
                            em.emit('state' + cfg.esp[buf.obj.id]);
                            break;
                        case "haStateUpdate":       // incoming state change (from HA websocket service)
                            log("receiving state data, entity: " + cfg.ha[buf.obj.id] + " value: " + state.ha[buf.obj.id], 0);
                            automation.forEach((func, index) => { if (state.auto[index]) func(index) });
                            state.ha[buf.obj.id] = buf.obj.state;
                            em.emit('state' + cfg.ha[buf.obj.id]);
                            break;
                        case "haFetchReply":        // Incoming HA Fetch result
                            state.ha = (buf.obj);
                            log("receiving fetch data: " + state.ha);
                            state.online = true;
                            automation.forEach((func, index) => { func(index) });
                            break;
                        case "haQueryReply":        // HA device query
                            console.log("Available HA Devices: " + buf.obj);
                            break;
                        case "udpReRegister":       // reregister request from server
                            log("server lost sync, reregistering...");
                            sys.register();
                            if (cfg.ha != undefined) { ha.fetch(); }
                            break;
                        case "diag":                // incoming diag refresh request, then reply object
                            diag = { state: state, nv: nv }
                            udp.send(JSON.stringify({ type: "diag", obj: diag }
                            ), 65432, 'localhost');
                            break;
                        case "telegram":
                            switch (buf.obj.class) {
                                case "agent":
                                    user.telegram.agent(buf.obj.data);
                                    break;
                            }
                            break;
                        case "timer": user.timer(buf.obj.day, buf.obj.dow, buf.obj.hour, buf.obj.min); break;
                        case "log": console.log(buf.obj); break;
                    }
                }
            });
        },
        register: function () {
            let obj = {};
            if (cfg.ha != undefined) obj.ha = cfg.ha;
            if (cfg.esp != undefined) obj.esp = cfg.esp;
            if (cfg.telegram != undefined) obj.telegram = true;
            udp.send(JSON.stringify({ type: "register", obj: obj, name: cfg.moduleName }), 65432, 'localhost');
        },
        heartBeat: function () { udp.send(JSON.stringify({ type: "heartBeat" }), 65432, 'localhost'); },
        checkArgs: function () {
            if (process.argv[2] == "-i") {
                log("installing TW-Client-" + cfg.moduleName + " service...");
                let service = [
                    "[Unit]",
                    "Description=\n",
                    "[Install]",
                    "WantedBy=multi-user.target\n",
                    "[Service]",
                    "ExecStart=nodemon " + cfg.workingDir + "/client.js -w " + cfg.workingDir + "/client.js",
                    "Type=simple",
                    "User=root",
                    "Group=root",
                    "WorkingDirectory=" + cfg.workingDir,
                    "Restart=on-failure\n",
                ];
                fs.writeFileSync("/etc/systemd/system/tw-client.service", service.join("\n"));
                // execSync("mkdir /apps/ha -p");
                // execSync("cp " + process.argv[1] + " /apps/ha/");
                execSync("systemctl daemon-reload");
                execSync("systemctl enable tw-client.service");
                execSync("systemctl start tw-client");
                execSync("service tw-client status");
                log("service installed and started");
                console.log("type: journalctl -f -u tw-client");
                process.exit();
            }
        },
        file: {
            write: {
                nv: function () {  // write non-volatile memory to the disk
                    log("writing NV data...")
                    fs.writeFile(workingDir + "/nv-bak.json", JSON.stringify(nv), function () {
                        fs.copyFile(workingDir + "/nv-bak.json", workingDir + "/nv.json", (err) => {
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
    esp = {
        state: function (name, state) { udp.send(JSON.stringify({ type: "espState", obj: { name: name, state: state } }), 65432, 'localhost') }
    },
    ha = {
        fetch: function () { udp.send(JSON.stringify({ type: "haFetch" }), 65432, 'localhost'); },
        getEntities: function () { udp.send(JSON.stringify({ type: "haQuery" }), 65432, 'localhost'); },
        state: function (name, state, unit, ip) {
            udp.send(JSON.stringify({ type: "haState", obj: { name: name, state: state, unit: unit, ip: ip } }), 65432, 'localhost');
        }
    },
    state = { ha: [], esp: [], auto: [], online: false },
    nv = {},
    diag = {};
setTimeout(() => { sys.boot(0); }, 1e3);
function bot(id, data, obj) { send("telegram", { class: "send", id: id, data: data, obj: obj }) }
function send(type, obj) { udp.send(JSON.stringify({ type: type, obj: obj }), 65432, 'localhost') }
function sendAsync(type, obj) {
    send(type, obj);
    return new Promise((resolve) => {
        const asyncHandler = (data) => {
            let buf = JSON.parse(data);
            //    console.log("promise is checking data: " + data)
            if (buf.type == "async") { resolve(buf.obj); udp.removeListener('message', asyncHandler); }
        };
        udp.on('message', asyncHandler);
    });
}
function log(message, index, level) {
    if (!level) send("log", { message: message, mod: cfg.moduleName, level: index });
    else send("log", { message: message, mod: state.auto[index].name, level: level });
}


