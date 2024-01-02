#!/usr/bin/node
let
    cfg = {
        autoName: "automation-name",    // name of your automation here
        telegram: {
            password: "password",           // telegram user registration password
        },
        ha: [   // your Home Assistant Entities go here   ["entity1", "entity2", "entity3"]

        ],
        esp: [
                // your ESP Entities go here   ["entity1", "entity2", "entity3"]
        ]
    };
function auto(init) {
    if (init) {
        // will run once on service start
    }
    // will run with every incoming Home Assistant and ESP state change
}
let
    user = {        // user configurable block - Telegram and timer function.  
        timer: {    // these functions are called once every min,hour,day. Use time.min time.hour and time.day for comparison 
            everyMin: function () {
                //  if (time.hour == 10 && time.min == 30)  // will execute every 10:30am

            },
            everyHour: function () {

            },
            everyDay: function () {

            },
        },
        telegram: { // enter a case matching your desireable input
            agent: function (msg) {
                //  log("incoming telegram message: " + msg, 0, 0);
                //  console.log("incoming telegram message: ", msg);
                if (sys.telegram.auth(msg)) {
                    switch (msg.text) {
                        case "?": onsole.log("test help menu"); break;
                        case "/start": bot(msg.chat.id, "you are already registered");; break;
                        case "R":   // to include uppercase letter in case match, we put no break between upper and lower cases
                        case "r":
                            bot(msg.from.id, "Test Menu:");
                            setTimeout(() => {      // delay to ensure menu Title gets presented first in Bot channel
                                sys.telegram.buttonToggle(msg, "t1", "Test Button");
                                setTimeout(() => {      // delay to ensure menu Title gets presented first in Bot channel
                                    sys.telegram.buttonMulti(msg, "t2", "Test Choices", ["test1", "test2", "test3"]);
                                }, 200);
                            }, 200);
                            break;
                        default:
                            log("incoming telegram message - unknown command - " + JSON.stringify(msg.text), 0, 0);
                            break;
                    }
                }
                else if (msg.text == cfg.telegram.password) sys.telegram.sub(msg);
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
        boot: function (step) {
            switch (step) {
                case 0:
                    sys.lib();
                    log("Loading non-volatile data...",);
                    fs.readFile(workingDir + "/nv.json", function (err, data) {
                        if (err) {
                            log("\x1b[33;1mNon-Volatile Storage does not exist\x1b[37;m"
                                + "\nnv.json file should be in same folder as ha.js file");
                            nv = { telegram: [] };
                        }
                        else { nv = JSON.parse(data); }
                    });
                    sys.com();
                    sys.register();
                    if (cfg.ha != undefined) { ha.fetch(); ha.getEntities(); }
                    setTimeout(() => { sys.boot(1); }, 1e3);
                    break;
                case 1:
                    setInterval(() => { sys.heartBeat(); }, 1e3);
                    auto(true);
                    log("automation started");
                    break;
            }
        },
        lib: function () {
            fs = require('fs'),
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
                            auto();
                            //   console.log("receiving esp data, ID: " + buf.obj.id + " state: " + buf.obj.state);
                            state.esp[buf.obj.id] = buf.obj.state;
                            break;
                        case "haFetchReply":        // Incoming HA Fetch result
                            auto();
                            state.ha = (buf.obj);
                            log("receiving fetch data: " + state.ha);
                            break;
                        case "haQueryReply":        // HA device query
                            //console.log("Available HA Devices: " + buf.obj);
                            break;
                            // console.log("server lost sync, reregistering...");
                            udp.send(JSON.stringify({ type: "register", obj: { ha: cfg.ha, esp: cfg.esp } }), 65432, 'localhost');
                            ha.fetch();
                            break;
                        case "haStateUpdate":       // incoming state change (from HA websocket service)
                            auto();
                            state.ha[buf.obj.id] = buf.obj.state;
                            //   console.log("receiving state data, entity: " + cfg.ha[buf.obj.id] + " vale: " + state.ha[buf.obj.id]);
                            break;
                        case "udpReRegister":       // reregister request from server
                        case "diag":                // diag and reply object
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
                        case "timerMin": user.timer.everyMin(); break;
                        case "timerHour": user.timer.everyHour(); break;
                        case "timerDay": user.timer.everyDay(); break;
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
            udp.send(JSON.stringify({ type: "register", obj: obj, name: cfg.autoName }), 65432, 'localhost');
        },
        heartBeat: function () { udp.send(JSON.stringify({ type: "heartBeat" }), 65432, 'localhost'); },
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
        state: function (name, state, unit) {
            udp.send(JSON.stringify({ type: "haState", obj: { name: name, state: state, unit: unit } }), 65432, 'localhost');
        }
    },
    state = { ha: [], esp: [], },
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
function log(message, level) {
    udp.send(JSON.stringify({ type: "log", obj: { message: message, mod: cfg.autoName, level: level } }), 65432, 'localhost')
}


