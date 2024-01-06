#!/usr/bin/node
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
if (isMainThread) {
    let
        ha = {  // shouldn't need to touch anything below this line except for log() function (to add your automation name)
            fetch: function (client) {
                let sendDelay = 0;
                let completed = 0;
                let buf = [];
                if (client.ha) {
                    for (let x = 0; x < client.ha.length; x++) {
                        for (let y = 0; y < cfg.homeAssistant.length; y++) {
                            for (let z = 0; z < logs.haInputs[y].length; z++) {
                                if (logs.haInputs[y][z] == client.ha[x]) {
                                    log("HA fetch found device for : " + a.color("white", client.name) + " - Entity: " + logs.haInputs[y][z], 1, 0)
                                    getData(y, client.ha[x]);
                                    break;
                                }
                            }
                        }
                    }
                    function getData(ha, name) {
                        if (name.includes("input_boolean")) {
                            setTimeout(() => {
                                hass[ha].states.get('input_boolean', name)
                                    .then(data => { data.state == "on" ? buf.push(true) : buf.push(false); finished(); })
                                    .catch(err => console.error(err))
                            }, sendDelay);
                            sendDelay += 20;
                        } else if (name.includes("switch")) {
                            setTimeout(() => {
                                hass[ha].states.get('switch', name)
                                    .then(data => { data.state == "on" ? buf.push(true) : buf.push(false); finished(); })
                                    .catch(err => console.error(err))
                            }, sendDelay);
                            sendDelay += 20;
                        } else if (name.includes("flow")) {
                            setTimeout(() => {
                                hass[ha].states.get('sensor', name)
                                    .then(data => {
                                        if (isNaN(Number(data.state)) != true && Number(data.state) != null)
                                            buf.push(Number(data.state));
                                        finished();
                                    })
                                    .catch(err => console.error(err))
                            }, sendDelay);
                            sendDelay += 20;
                        } else {
                            setTimeout(() => {
                                hass[ha].states.get('sensor', name)
                                    .then(data => { buf.push(Number(data.state)); finished(); })
                                    .catch(err => console.error(err))
                            }, sendDelay);
                            sendDelay += 20;
                        }
                    }
                }
                function finished() {
                    completed++;
                    if (client.ha.length == completed) {
                        udp.send(JSON.stringify({ type: "haFetchReply", obj: buf }), client.port)
                    }
                }
            },
            ws: function () {
                for (let x = 0; x < cfg.homeAssistant.length; x++) {
                    ws.push({});
                    let client = state.ha[x].ws;
                    let config = cfg.homeAssistant[x];
                    ws[x].connect("ws://" + config.address + ":" + config.port + "/api/websocket");
                    ws[x].on('connectFailed', function (error) { if (!client.error) { log(error.toString(), 1, 3); client.error = true; } });
                    ws[x].on('connect', function (socket) {
                        //    if (client.reply == false) { log("fetching sensor states", 1); ha.fetch(); client.id = 0; }
                        client.reply = true;
                        client.online = true;
                        client.error = false;
                        socket.on('error', function (error) {
                            if (!client.error) { log("websocket (" + a.color("white", config.address) + ") " + error.toString(), 1, 3); client.error = true; }
                        });
                        //   socket.on('close', function () { log('Connection closed!', 1, 3); });
                        socket.on('message', function (message) {
                            let buf = JSON.parse(message.utf8Data);
                            switch (buf.type) {
                                case "pong":
                                    //    log("pong: " + JSON.stringify(buf))
                                    client.reply = true;
                                    client.online = true;
                                    client.pingsLost = 0;
                                    let timeFinish = new Date().getMilliseconds();
                                    let timeResult = timeFinish - client.timeStart;
                                    if (timeResult > 100) log("websocket (" + a.color("white", config.address) + ") ping is lagging - delay is: " + timeResult + "ms", 1, 2);
                                    break;
                                case "auth_required":
                                    log("Websocket (" + a.color("white", config.address) + ") authenticating", 1);
                                    send({ type: "auth", access_token: config.token, });
                                    break;
                                case "auth_ok":
                                    state.udp = []; // force reregistrations on connect (will force fetch again)
                                    log("Websocket (" + a.color("white", config.address) + ") authentication accepted", 1);
                                    log("Websocket (" + a.color("white", config.address) + ") subscribing to event listener", 1);
                                    send({ id: 1, type: "subscribe_events", event_type: "state_changed" });
                                    client.timeStart = new Date().getMilliseconds();
                                    send({ id: client.id++, type: "ping" });
                                    setTimeout(() => { client.pingsLost = 0; send({ id: client.id++, type: "ping" }); client.reply = true; ping(); }, 10e3);
                                    break;
                                case "result": // sudo callback for set state via ws
                                    //  if (buf.id == tt2) log("ws result delay was: " + (Date.now() - tt))
                                    // log("result: " + JSON.stringify(buf));
                                    // 
                                    //  let delay = ha.perf(0);
                                    //     log("ws delay was: " + delay, 0, 0)
                                    break;
                                case "event":
                                    switch (buf.event.event_type) {
                                        case "state_changed":
                                            if (config.legacyAPI == false && state.perf.ha[x].wait == true) {
                                                let delay = ha.perf(0);
                                                log("ws delay was: " + delay, 0, 0)
                                            }
                                            let ibuf = undefined;
                                            if (buf.event.data.new_state != undefined
                                                && buf.event.data.new_state != null) ibuf = buf.event.data.new_state.state;
                                            let obuf = undefined;
                                            if (logs.ws[x][client.logStep] == undefined) logs.ws[x].push(buf.event);
                                            else logs.ws[x][client.logStep] = buf.event
                                            if (client.logStep < 200) client.logStep++; else client.logStep = 0;
                                            //  log("WS received data" + JSON.stringify(buf.event))
                                            for (let x = 0; x < state.udp.length; x++) {
                                                for (let y = 0; y < state.udp[x].ha.length; y++) {
                                                    if (state.udp[x].ha[y] == buf.event.data.entity_id) {
                                                        //     log("WS received data for sensor: " + x + JSON.stringify(buf.event.data.new_state))
                                                        if (ibuf === "on") obuf = true;
                                                        else if (ibuf === "off") obuf = false;
                                                        else if (ibuf === null || ibuf == undefined) log("HA (" + a.color("white", config.address) + ") is sending bogus (null/undefined) data: " + ibuf, 1, 2);
                                                        else if (ibuf === "unavailable") {
                                                            if (config.log.espDisconnect == true)
                                                                log("HA (" + a.color("white", config.address) + "): ESP Module " + buf.event.data.new_state.entity_id + " has gone offline - " + ibuf, 1, 2);
                                                        }
                                                        else if (!isNaN(parseFloat(Number(ibuf))) == true
                                                            && isFinite(Number(ibuf)) == true && Number(ibuf) != null) obuf = ibuf;
                                                        else log("HA (" + a.color("white", config.address) + ") is sending bogus (no match) Entity: " + buf.event.data.new_state.entity_id + " data: " + ibuf, 1, 2);
                                                        //   log("ws sensor: " + x + " data: " + buf.event.data.new_state.state + " result: " + ibuf);
                                                        if (obuf != undefined) {
                                                            udp.send(JSON.stringify({ type: "haStateUpdate", obj: { id: x, state: obuf } }), state.udp[x].port);
                                                        }
                                                    }
                                                }
                                            }
                                            break;
                                    }
                                    break;
                            }
                        });
                        em.on('send' + x, function (data) { send(data) });
                        function send(data) { socket.sendUTF(JSON.stringify(data)); }
                        function ping() {
                            if (client.reply == false) {
                                if (client.pingsLost < 2) {
                                    log("websocket (" + a.color("white", config.address) + ") ping never got replied in 10 sec", 1, 3);
                                    client.pingsLost++;
                                }
                                else { socket.close(); haReconnect("ping timeout"); return; }
                            }
                            client.reply = false;
                            client.timeStart = new Date().getMilliseconds();
                            send({ id: client.id++, type: "ping" });
                            setTimeout(() => { ping(); }, 10e3);
                        }
                        function haReconnect(error) {
                            log("websocket (" + a.color("white", config.address) + ") " + error.toString(), 1, 3);
                            ws[x].connect("ws://" + config.address + ":" + config.port + "/api/websocket");
                            setTimeout(() => { if (client.reply == false) { haReconnect("retrying..."); } }, 10e3);
                        }
                    });
                }
            },
            perf: function (num) {
                state.perf.ha[num].wait = false;
                let delay = Date.now() - state.perf.ha[num].start;
                if (delay < state.perf.ha[num].best) state.perf.ha[num].best = delay;
                if (delay > state.perf.ha[num].worst) state.perf.ha[num].worst = delay;
                let total = 0;
                if (state.perf.ha[num].last100Pos < 99) {
                    if (state.perf.ha[num].last100[state.perf.ha[num].last100Pos]) state.perf.ha[num].last100[state.perf.ha[num].last100Pos++] = delay;
                    else state.perf.ha[num].last100.push(delay);
                } else {
                    console.log(state.perf.ha);
                    if (state.perf.ha[num].last100[state.perf.ha[num].last100Pos]) state.perf.ha[num].last100[state.perf.ha[num].last100Pos] = delay;
                    else state.perf.ha[num].last100.push(delay);
                    state.perf.ha[num].last100Pos = 0;
                    state.perf.ha[num].worst = 0;
                    state.perf.ha[num].best = 1000;
                }
                state.perf.ha[num].last100.forEach(element => { total += element });
                state.perf.ha[num].average = Math.floor(total / state.perf.ha[num].last100.length);
                return delay;
            }
        },
        sys = {
            boot: function (step) {
                switch (step) {
                    case 0:     // read config.json file
                        fs = require('fs')
                        workingDir = require('path').dirname(require.main.filename);
                        console.log("Loading config data...");
                        fs.readFile(workingDir + "/config.json", function (err, data) {
                            if (err) {
                                console.log("\x1b[31;1mCannot find config file, exiting\x1b[37;m"
                                    + "\ncfg.json file should be in same folder as ha.js file");
                                process.exit();
                            }
                            else { cfg = JSON.parse(data); sys.boot(1); }
                        });
                        break;
                    case 1:     // read nv.json file
                        console.log("Initializing workers");
                        if (cfg.esp.enable == true) {               // load worker threads
                            console.log("ESP thread initiating...");
                            sys.worker.esp = new Worker(__filename, { workerData: { threadId: "ESP" } });
                            sys.worker.esp.on('message', (data) => sys.ipc(data));
                            sys.worker.esp.postMessage({ type: "config", obj: cfg });
                        }
                        sys.boot(2);
                        return;
                        console.log("Loading non-volatile data...");
                        fs.readFile(workingDir + "/nv.json", function (err, data) {
                            if (err) {
                                console.log("\x1b[33;1mNon-Volatile Storage does not exist\x1b[37;m"
                                    + "\nnv.json file should be in same folder as ha.js file");
                                nv = { telegram: [] };
                                sys.boot(2);
                            }
                            else { nv = JSON.parse(data); }
                        });
                        break;
                    case 2:     // state init and load modules
                        sys.lib();
                        sys.init();
                        log("initializing system states done");
                        log("checking args");
                        sys.checkArgs();
                        log("Working Directory: " + cfg.workingDir);
                        udp.on('listening', () => { log("starting UDP Server - Port 65432"); });
                        udp.on('error', (err) => { console.error(`udp server error:\n${err.stack}`); udp.close(); });
                        udp.on('message', (msg, info) => { sys.udp(msg, info); });
                        udp.bind(65432);
                        if (cfg.webDiag) {
                            express.get("/el", function (request, response) { response.send(logs.esp); });
                            express.get("/ha", function (request, response) { response.send(logs.haInputs); });
                            express.get("/log", function (request, response) { response.send(logs.sys); });
                            express.get("/tg", function (request, response) { response.send(logs.tg); });
                            express.get("/ws", function (request, response) { response.send(logs.ws); });
                            express.get("/nv", function (request, response) { response.send(nv); });
                            express.get("/state", function (request, response) { response.send(state); });
                            express.get("/cfg", function (request, response) { response.send(cfg); })
                            express.get("/perf", function (request, response) { response.send(state.perf); })
                            express.get("/esp", function (request, response) { response.send(state.esp); })
                            express.get("/udp", function (request, response) { response.send(state.udp); })
                            express.get("/diag", function (request, response) {
                                for (let x = 0; x < state.udp.length; x++) {
                                    udp.send(JSON.stringify({ type: "diag" }), state.udp[x].port);
                                }
                                setTimeout(() => { response.send(diag); }, 100);
                            })
                            serverWeb = express.listen(cfg.webDiagPort, function () { log("diag web server starting on port " + cfg.webDiagPort, 0); });
                        }
                        if (cfg.telegram.enable == true) {
                            TelegramBot = require('node-telegram-bot-api');
                            if (cfg.telegram.token != undefined && cfg.telegram.token.length < 40) {
                                log(a.color("red", "Telegram API Token is invalid", 3));
                            } else {
                                log("starting Telegram service...");
                                bot = new TelegramBot(cfg.telegram.token, { polling: true });
                                //   bot.on("polling_error", (msg) => console.log(msg));
                                bot.on('message', (msg) => {
                                    if (logs.tg[logs.tgStep] == undefined) logs.tg.push(msg);
                                    else logs.tg[logs.tgStep] = msg;
                                    if (logs.tgStep < 100) logs.tgStep++; else logs.tgStep = 0;
                                    // user.telegram.agent(msg);]
                                    udp.send(JSON.stringify({ type: "telegram", obj: { class: "agent", data: msg } }), state.telegram.port);
                                });
                                bot.on('callback_query', (msg) => {
                                    udp.send(JSON.stringify({ type: "telegram", obj: { class: "callback", data: msg } }), state.telegram.port);
                                    // user.telegram.response(msg)
                                });
                                state.telegram.started = true;
                            }
                        }
                        sys.boot(3);
                        break;
                    case 3:     // connect to Home Assistant
                        for (let x = 0; x < cfg.homeAssistant.length; x++) {
                            if (cfg.homeAssistant[x].enable == true) {
                                haconnect();
                                function haconnect() {
                                    hass[x].status()
                                        .then(data => {
                                            log("Legacy HA (" + a.color("white", cfg.homeAssistant[x].address) + ") service: " + a.color("green", data.message), 1);
                                            log("Legacy HA (" + a.color("white", cfg.homeAssistant[x].address) + ") fetching available inputs", 1);
                                            hass[x].states.list()
                                                .then(data => {
                                                    data.forEach(element => { logs.haInputs[x].push(element.entity_id) });
                                                    if (x == cfg.homeAssistant.length - 1) sys.boot(4);
                                                })
                                                .catch(err => { log(err, 1, 2); });
                                        })
                                        .catch(err => {
                                            setTimeout(() => {
                                                log("Legacy HA (" + a.color("white", cfg.homeAssistant[x].address) + ") service: Connection failed, retrying....", 1, 2)
                                                haconnect();
                                            }, 10e3);
                                            log(err, 1, 2);
                                        });
                                }
                            } else if (x == cfg.homeAssistant.length - 1) sys.boot(4);
                        }
                        break;
                    case 4:     // start system timer - starts when initial HA Fetch completes
                        log("stating websocket service...");
                        ha.ws();
                        setInterval(() => sys.time.timer(), 1000);
                        break;
                }
            },
            udp: function (data, info) {
                let buf,
                    port = info.port,
                    registered = false,
                    id = undefined,
                    haNum = undefined,
                    time = Date.now();
                try { buf = JSON.parse(data); }
                catch (error) { log("A UDP client (" + info.address + ") is sending invalid JSON data: " + error, 3, 3); return; }
                // console.log(buf)
                for (let x = 0; x < state.udp.length; x++) {
                    if (time - state.udp[x].time >= 2000) {
                        state.udp.splice(x, 1);
                        diag.splice(x, 1);
                        log("removing stale client id: " + x, 3)
                    }
                }
                checkUDPreg();
                switch (buf.type) {
                    case "heartBeat": break; // heartbeat
                    case "espState":    // incoming state change (ESP)
                        if (cfg.esp.enable == true) {
                            for (let x = 0; x < cfg.esp.devices.length; x++) {
                                for (let y = 0; y < state.esp.entities[x].length; y++) {
                                    if (state.esp.entities[x][y].name == buf.obj.name) {
                                        sys.worker.esp.postMessage(
                                            { type: "espSend", obj: { name: buf.obj.name, id: state.esp.entities[x][y].id, state: buf.obj.state } });
                                        break;
                                    }
                                }
                            }
                        }
                        // log("incoming esp state: " + buf.obj.name + " data: " + buf.obj.state, 3, 0);
                        break;
                    case "haFetch":     // incoming fetch request
                        ha.fetch(state.udp[id]);
                        //     log("receiving fetch request", 3, 0);
                        break;
                    case "haQuery":     // HA device list request
                        logs.haInputs = [];
                        for (let x = 0; x < cfg.homeAssistant.length; x++) {
                            logs.haInputs.push([]);
                            log("sending all HA (" + a.color("white", cfg.homeAssistant[x].address) + ") entities to UDP", 3, 1);
                            hass[x].states.list()
                                .then(dbuf => { dbuf.forEach(element => { logs.haInputs[x].push(element.entity_id) }); })
                                .catch(err => {
                                    console.log("\nCannot connect to HA, IP address or token incorrect");
                                    process.exit();
                                });
                        }
                        udp.send(JSON.stringify({ type: "haQueryReply", obj: logs.haInputs }), port);
                        break;
                    case "haState":     // incoming state change (Home Assistant)
                        let sensor = undefined;
                        // console.log(buf)
                        for (let y = 0; y < cfg.homeAssistant.length; y++) {
                            for (let z = 0; z < logs.haInputs[y].length; z++) {
                                if (buf.obj.name == logs.haInputs[y][z]) {
                                    haNum = y;
                                    sensor = false;
                                    break;
                                } else {
                                    if (z == logs.haInputs[y].length - 1 && buf.obj.ip == cfg.homeAssistant[y].address) {
                                        haNum = y;
                                        sensor = true;
                                        break;
                                    }
                                }
                            }
                        }
                        if (sensor == undefined) {
                            log("received invalid HA State setting: " + JSON.stringify(buf), 3, 3); return;
                        }
                        state.perf.ha[haNum].start = Date.now();
                        state.perf.ha[haNum].wait = true;
                        state.perf.ha[haNum].id = state.ha[haNum].ws.id;
                        let sort = ["input_boolean", "input_button", "switch"];
                        if (buf.obj.unit == undefined) {
                            log("UDP receive HA State Set, name: " + buf.obj.name + " value: " + buf.obj.state, 3, 0);
                            for (let x = 0; x < sort.length; x++) {
                                if (buf.obj.name) {
                                    if (buf.obj.name.includes(sort[x])) {
                                        if (cfg.homeAssistant[haNum].legacyAPI == false) {
                                            em.emit('send' + haNum, {
                                                "id": state.ha[haNum].ws.id++,
                                                "type": "call_service",
                                                "domain": sort[x],
                                                "service": buf.obj.state == false ? 'turn_off' : 'turn_on',
                                                "target": { "entity_id": buf.obj.name }
                                            })
                                        } else {
                                            hass[haNum].services.call(buf.obj.state == false ? 'turn_off' : 'turn_on', sort[x], { entity_id: buf.obj.name })
                                                .then(dbuf => {
                                                    let delay = ha.perf(haNum);
                                                    log("delay was: " + delay, 0, 0);
                                                });
                                        }
                                        break;
                                    }
                                }
                            }
                            return;
                        }
                        if (buf.obj.unit != undefined && buf.obj.name != undefined) {
                            //    log("sensor test, name: " + buf.obj.name + " value: " + buf.obj.state + " unit: " + buf.obj.unit, 0, 0);
                            hass[haNum].states.update('sensor', "sensor." + buf.obj.name,
                                { state: Number(buf.obj.state).toFixed(2), attributes: { state_class: 'measurement', unit_of_measurement: buf.obj.unit } });
                        }
                        break;
                    case "register":    // incoming registrations
                        state.udp[id].name = buf.name;
                        log("client " + id + " - " + a.color("white", buf.name) + " - is initiating new connection", 3, 1);
                        if (buf.obj.ha != undefined) {
                            log("client " + id + " - " + a.color("white", buf.name) + " - is registering Home Assistant entities", 3, 1);
                            buf.obj.ha.forEach(element => { state.udp[id].ha.push(element) });
                        }
                        if (buf.obj.esp != undefined) {
                            buf.obj.esp.forEach(element => { state.udp[id].esp.push(element) });
                            log("client " + id + " - " + a.color("white", buf.name) + " - is registering ESP entities", 3, 1);
                        }
                        if (buf.obj.telegram != undefined && buf.obj.telegram == true) {
                            log("client " + id + " - " + a.color("white", buf.name) + " - is registering as telegram agent", 3, 1);
                            state.telegram.port = info.port;
                        }
                        if (cfg.esp.enable == true) sys.worker.esp.postMessage({ type: "udp", obj: state.udp });
                        break;
                    case "log":         // incoming log messages from UDP clients
                        log(buf.obj.message, buf.obj.mod, buf.obj.level, port);
                        break;
                    case "diag":        // incoming UDP client Diag
                        //       log("receiving diag")
                        diag[id] = { name: state.udp[id].name, ip: state.udp[id].ip, data: buf.obj }
                        break;
                    case "telegram":
                        // log("receiving telegram data: " + buf.obj, 4, 0);
                        switch (buf.obj.class) {
                            case "send":
                                bot.sendMessage(buf.obj.id, buf.obj.data, buf.obj.obj);
                                break;
                        }
                        break;
                    case "test":
                        log("receiving test", 3, 0)
                        udp.send(JSON.stringify({ type: "async", obj: "test" }), port);
                        break;
                    default:            // default to heartbeat

                        break;
                }
                function checkUDPreg() {
                    for (let x = 0; x < state.udp.length; x++) {
                        if (state.udp[x].port == port) {
                            state.udp[x].time = time;
                            id = x;
                            registered = true;
                            break;
                        }
                    }
                    if (registered == false) {
                        id = state.udp.push({ name: buf.name, port: port, ip: info.address, time: time, ha: [], esp: [] }) - 1;
                        diag.push([]);
                        if (buf.type != "register") {
                            log("client " + id + " is unrecognized", 3, 2);
                            udp.send(JSON.stringify({ type: "udpReRegister" }), port);
                        }
                    }
                }
            },
            ipc: function (data) {      // Incoming inter process communication 
                //     console.log(data)
                switch (data.type) {
                    case "espState": state.esp = data.obj; break;
                    case "log": sys.log(data.obj[0], data.obj[1], data.obj[2]); break;
                    case "udpSend": udp.send(JSON.stringify({ type: data.obj.type, obj: data.obj.obj }), data.port); break;
                }
            },
            lib: function () {
                a = {
                    color: function (color, input, ...option) {   //  ascii color function for terminal colors
                        if (input == undefined) input = '';
                        let c, op = "", bold = ';1m', vbuf = "";
                        for (let x = 0; x < option.length; x++) {
                            if (option[x] == 0) bold = 'm';         // bold
                            if (option[x] == 1) op = '\x1b[5m';     // blink
                            if (option[x] == 2) op = '\u001b[4m';   // underline
                        }
                        switch (color) {
                            case 'black': c = 0; break;
                            case 'red': c = 1; break;
                            case 'green': c = 2; break;
                            case 'yellow': c = 3; break;
                            case 'blue': c = 4; break;
                            case 'purple': c = 5; break;
                            case 'cyan': c = 6; break;
                            case 'white': c = 7; break;
                        }
                        if (input === true) return '\x1b[3' + c + bold;     // begin color without end
                        if (input === false) return '\x1b[37;m';            // end color
                        vbuf = op + '\x1b[3' + c + bold + input + '\x1b[37;m';
                        return vbuf;
                    }
                },
                    exec = require('child_process').exec,
                    execSync = require('child_process').execSync,
                    HomeAssistant = require('homeassistant'),
                    expressLib = require("express"),
                    express = expressLib(),
                    WebSocketClient = require('websocket').client,
                    events = require('events'),
                    em = new events.EventEmitter(),
                    udpServer = require('dgram'),
                    udp = udpServer.createSocket('udp4');
            },
            init: function () { // initialize system volatile memory
                state = { udp: [], ha: [], perf: { ha: [] } };
                diag = [];      // array for each UDP client diag
                ws = [];
                hass = [];
                time = { date: undefined, month: 0, day: 0, dayLast: undefined, hour: 0, hourLast: undefined, min: 0, minLast: undefined, sec: 0, up: 0, ms: 0, millis: 0, stamp: "" };
                logs = { step: 0, sys: [], ws: [], tg: [], tgStep: 0, haInputs: [], esp: [] };
                sys.time.sync();
                time.minLast = time.min;
                time.hourLast = time.hour;
                time.dayLast = time.day;
                for (let x = 0; x < cfg.homeAssistant.length; x++) {
                    logs.ws.push([]);
                    logs.haInputs.push([]);
                    state.ha.push({ ws: {} });
                    ws.push(new WebSocketClient());
                    hass.push(new HomeAssistant({
                        host: "http://" + cfg.homeAssistant[x].address,
                        port: cfg.homeAssistant[x].port,
                        token: cfg.homeAssistant[x].token,
                        ignoreCert: true
                    }));
                    state.ha[x].ws =
                    {
                        timeout: null, // used for esp reset 
                        logStep: 0,
                        error: false,
                        id: 1,
                        reply: true,
                        pingsLost: 0,
                        timeStart: 0,
                    };
                    state.perf.ha.push(
                        {
                            best: 1000,
                            worst: 0,
                            average: 0,
                            id: 0,
                            start: 0,
                            wait: false,
                            last100Pos: 0,
                            last100: [],
                        }
                    );
                };
                state.esp = { discover: [], entities: [] };
                state.telegram = { started: false }
            },
            checkArgs: function () {
                if (process.argv[2] == "-i") {
                    log("installing HA Auto service...");
                    let service = [
                        "[Unit]",
                        "Description=\n",
                        "[Install]",
                        "WantedBy=multi-user.target\n",
                        "[Service]",
                        "ExecStart=/bin/nodemon " + cfg.workingDir + "/ha.js",
                        "Type=simple",
                        "User=root",
                        "Group=root",
                        "WorkingDirectory=" + cfg.workingDir,
                        "Restart=on-failure\n",
                    ];
                    fs.writeFileSync("/etc/systemd/system/ha.service", service.join("\n"));
                    // execSync("mkdir /apps/ha -p");
                    // execSync("cp " + process.argv[1] + " /apps/ha/");
                    execSync("systemctl daemon-reload");
                    execSync("systemctl enable ha.service");
                    execSync("systemctl start ha");
                    log("service installed and started");
                    console.log("type: journalctl -f -u ha");
                    process.exit();
                }
            },
            log: function (message, mod, level, port) {      // add a new case with the name of your automation function
                let
                    buf = sys.time.sync(), cbuf = buf + "\x1b[3", lbuf = "", mbuf = "", ubuf = buf + "\x1b[3";
                if (level == undefined) level = 1;
                switch (level) {
                    case 0: ubuf += "6"; cbuf += "6"; lbuf += "|--debug--|"; break;
                    case 1: ubuf += "4"; cbuf += "7"; lbuf += "|  Event  |"; break;
                    case 2: ubuf += "3"; cbuf += "3"; lbuf += "|*Warning*|"; break;
                    case 3: ubuf += "1"; cbuf += "1"; lbuf += "|!!ERROR!!|"; break;
                    case 4: ubuf += "5"; cbuf += "5"; lbuf += "|~~DTEST~~|"; break;
                    default: ubuf += "4"; cbuf += "4"; lbuf += "|  Event  |"; break;
                }
                buf += lbuf;
                cbuf += "m" + lbuf + "\x1b[37;m";
                ubuf += ";1m" + lbuf + "\x1b[37;m";
                switch (mod) {      // add a new case with the name of your automation function, starting at case 3
                    case 0: mbuf += " system | "; break;
                    case 1: mbuf += "     HA | "; break;
                    case 2: mbuf += "    ESP | "; break;
                    case 3: mbuf += "    UDP | "; break;
                    case 4: mbuf += "Telegram| "; break;
                    default:
                        if (mod != undefined) ubuf += mod + " | ";
                        else mbuf += " system | ";
                        break;
                }
                buf += mbuf + message;
                cbuf += mbuf + message;
                ubuf += mbuf + message;
                if (logs.sys[logs.step] == undefined) logs.sys.push(buf);
                else logs.sys[logs.step] = buf;
                if (logs.step < 500) logs.step++; else logs.step = 0;
                if (cfg.telegram.enable == true && state.telegram.started == true) {
                    if (level >= cfg.telegram.logLevel
                        || level == 0 && cfg.telegram.logDebug == true) {
                        for (let x = 0; x < cfg.telegram.user.length; x++) {
                            bot.sendMessage(cfg.telegram.user[x].id, buf);
                        }
                    }
                }
                if (port != undefined) {
                    console.log(ubuf);
                    udp.send(JSON.stringify({ type: "log", obj: ubuf }), port);
                } else if (level == 0 && cfg.debugging == true) console.log(cbuf);
                else if (level != 0) console.log(cbuf);
                return buf;
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
            time: {
                sync: function () {
                    time.date = new Date();
                    time.ms = time.date.getMilliseconds();
                    time.sec = time.date.getSeconds();
                    time.min = time.date.getMinutes();
                    time.hour = time.date.getHours();
                    time.day = time.date.getDate();
                    time.month = time.date.getMonth();
                    time.stamp = ("0" + time.month).slice(-2) + "-" + ("0" + time.day).slice(-2) + " "
                        + ("0" + time.hour).slice(-2) + ":" + ("0" + time.min).slice(-2) + ":"
                        + ("0" + time.sec).slice(-2) + "." + ("00" + time.ms).slice(-3);
                    return time.stamp;
                },
                timer: function () {    // called every second
                    if (time.minLast != time.min) { time.minLast = time.min; everyMin(); }
                    time.up++;
                    sys.time.sync();
                    function everyMin() {
                        if (time.hourLast != time.hour) { time.hourLast = time.hour; everyHour(); }
                        for (let x = 0; x < state.udp.length; x++) {
                            udp.send(JSON.stringify({ type: "timerMin" }), state.udp[x].port);
                        }
                    }
                    function everyHour() {
                        if (time.dayLast != time.day) { time.dayLast = time.day; everyDay(); }
                        for (let x = 0; x < state.udp.length; x++) {
                            udp.send(JSON.stringify({ type: "timerHour" }), state.udp[x].port);
                        }
                    }
                    function everyDay() {
                        for (let x = 0; x < state.udp.length; x++) {
                            udp.send(JSON.stringify({ type: "timerDay" }), state.udp[x].port);
                        }
                    }
                },
            },
            worker: {},
        };
    sys.boot(0);
    function log(...buf) { sys.log(...buf) }
} else {
    const data = workerData;
    if (data.threadId === "ESP") {
        let espClient = [],
            state = { esp: { discover: [], entities: [], }, udp: {} };
        const
            { Client } = require('@2colors/esphome-native-api'),
            { Discovery } = require('@2colors/esphome-native-api'),
            events = require('events'),
            em = new events.EventEmitter(),
            a = {
                color: function (color, input, ...option) {   //  ascii color function for terminal colors
                    if (input == undefined) input = '';
                    let c, op = "", bold = ';1m', vbuf = "";
                    for (let x = 0; x < option.length; x++) {
                        if (option[x] == 0) bold = 'm';         // bold
                        if (option[x] == 1) op = '\x1b[5m';     // blink
                        if (option[x] == 2) op = '\u001b[4m';   // underline
                    }
                    switch (color) {
                        case 'black': c = 0; break;
                        case 'red': c = 1; break;
                        case 'green': c = 2; break;
                        case 'yellow': c = 3; break;
                        case 'blue': c = 4; break;
                        case 'purple': c = 5; break;
                        case 'cyan': c = 6; break;
                        case 'white': c = 7; break;
                    }
                    if (input === true) return '\x1b[3' + c + bold;     // begin color without end
                    if (input === false) return '\x1b[37;m';            // end color
                    vbuf = op + '\x1b[3' + c + bold + input + '\x1b[37;m';
                    return vbuf;
                }
            };
        function esp() {  // currently testing for outgoing signaling 
            espInit();                                                              // start the init sequence
            function espInit() {                                                    // create a new client for every ESP device in the local object
                for (let x = 0; x < cfg.esp.devices.length; x++) {
                    espClient.push(clientNew(x));
                    state.esp.entities.push([]);                                    // create entity array for each ESP device
                    clientConnect(x);
                }
            }
            function clientConnect(x) {
                log("connecting to esp module: " + a.color("white", cfg.esp.devices[x].ip), 2);       // client connection function, ran for each ESP device
                espClient[x].connect();
                espClient[x].on('newEntity', entity => {
                    let exist = 0;
                    for (let e = 0; e < state.esp.entities[x].length; e++) {        // scan for this entity in the entity list
                        if (state.esp.entities[x][e].id == entity.id) exist++;
                    }
                    if (exist == 0)                                                 // dont add this entity if its already in the list 
                        state.esp.entities[x].push({ name: entity.config.objectId, type: entity.type, id: entity.id });
                    log("new entity - connected - " + a.color("green", entity.config.objectId), 2);
                    parentPort.postMessage({ type: "espState", obj: state.esp });
                    if (entity.type === "Switch") {                                 // if this is a switch, register the emitter
                        //  log("setting entity: " + id + " to " + state, 0, 0)
                        em.on(entity.config.objectId, function (id, state) {        // emitter for this connection 
                            entity.connection.switchCommandService({ key: id, state: state });
                        });
                    }
                    entity.on('state', (data) => {
                        for (let y = 0; y < state.esp.entities[x].length; y++) {
                            if (state.esp.entities[x][y].id == data.key) {          // identify this entity request with local object
                                //      log("esp data: " + state.esp.entities[x][y].name + " state: " + data.state, 2, 0)
                                for (let a = 0; a < state.udp.length; a++) {        // scan all the UDP clients and find which one cares about this entity
                                    for (let b = 0; b < state.udp[a].esp.length; b++) {                 // scan each UDP clients registered ESP entity list
                                        if (state.udp[a].esp[b] == state.esp.entities[x][y].name) {     // if there's a match, send UDP client the data
                                            parentPort.postMessage({
                                                type: "udpSend",
                                                obj: { type: "espStateUpdate", obj: { id: b, state: data.state }, },
                                                port: state.udp[a].port
                                            });
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    });
                });
                espClient[x].on('error', (error) => {
                    //  console.log(error);
                    log("ESP module went offline, resetting ESP system", 2, 2);
                    reset();                                                        // if there's a connection problem, start reset sequence
                });
            }
            function clientNew(x) {                                                 // create new object for every ESP device 
                return new Client({
                    host: cfg.esp.devices[x].ip,
                    port: 6053,
                    encryptionKey: cfg.esp.devices[x].key,
                    reconnect: true,
                    reconnectInterval: 5000,
                    pingInterval: 3000,
                    pingAttempts: 3
                })
            }
            function reset() {
                em.emit('ws-disconnect');                                               // close and reset websocket service (because removeAllListeners)
                em.removeAllListeners();                                                // remove all event listeners 
                for (let c = 0; c < espClient.length; c++) espClient[c].disconnect();   // disconnect every client 
                espClient = [];                                                         // delete all client objects 
                setTimeout(() => { espInit(); }, 100);                                  // reconnect to every device
            }
            parentPort.postMessage({ type: "espState", obj: state.esp });
        }
        parentPort.on('message', (data) => {
            //   console.log(data.obj);
            //     log("incominig esp state request Data: " + data.obj, 2, 0);
            switch (data.type) {
                case "config":
                    cfg = data.obj;
                    log("ESP Discovery initiated...", 2);
                    Discovery().then(results => { state.esp.discover = results });
                    log("ESP connections initiating...", 2);
                    esp();
                    break;
                case "udp": state.udp = data.obj; break;
                case "espSend":
                    em.emit(data.obj.name, data.obj.id, data.obj.state);
                    break;
            }
        });
        function log(...buf) { parentPort.postMessage({ type: "log", obj: { ...buf } }); }
    }
}
