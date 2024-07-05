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
            "input_boolean.auto_compressor",
            "input_boolean.auto_pump_transfer",
            "input_boolean.auto_solar_compressor",
            "input_boolean.auto_solar_transfer",
            "input_boolean.auto_pump_pressure_turbo",
        ],
        esp: [                              // add all your ESP entities here
            "battery-voltage",
            "power1-relay1",        // 10kw inverter
            "power1-relay2",        // fan 
            "power1-relay3",        // inverter 8kw ATS
            "power1-relay4",        // inverter 10kw ATS
            "8kw-power",            // 8kw watts
            "8kw-energy",           // 8kw energy
            "grid-voltage",         // grid voltage
            "grid-power",           // grid watts
            "grid-energy",          // grid kwh
            "sun-level",
            "temp-battery-room",
            "lth-relay1",           // compressor
            "uth-relay1",           // 1/2hp pump
            "10kw-power",           // 10kw watts
            "10kw-energy",          // 10kw watts
            "battery-power",        // battery amps
            "battery-energy",       // battery amps
            "battery-voltage2",
        ],
        grid: {
            espVoltage: 7,
            espPower: 8,
        },
        solar: {
            inverterAuto: 0,
            espSunlight: 10,
            batteryReserve: 40, // charging amps to reserve for battery charging
            fan: {
                espPower: 2
                //   tempOn: 
            },
            priority: [
                { onSun: 2.5, offSun: 2.45, onVolts: 53.0, offVolts: 52.8, haAuto: 3, watts: 1000, devices: ["input_boolean.auto_compressor"] },
                { onSun: 2.65, offSun: 2.6, onVolts: 53.5, offVolts: 53.2, haAuto: 4, devices: ["input_boolean.auto_pump_transfer"] },
                { onSun: 2.5, offSun: 2.4, timeOnHour: 9, timeOnMin: 30, devices: ["input_boolean.auto_pump_pressure_turbo"] },
                { onSun: 2.5, offSun: 2.4, devices: ["power1-relay2"] }, // fan

            ],
        },
        inverter: [
            {
                name: "8Kw",
                nightTime: true,        // this inverter runs at night
                nighTimeStartHour: 16,  // time to start nighttime mode
                nighTimeStartMin: 30,
                espSwitchTransfer: 3,   // ats relay
                espVoltage: 0,          // voltage sensor 
                espPower: 5,            // inverter remote power 
                voltsFactor: 20.33,     // multiplier for voltage divider
                voltsRun: 52.5,         // volts to start inverter - 
                voltsStop: 51.4,
                sunRun: 2.2,
                sunStop: 2.0,           // reduce battery wear
                welderWatts: 4000,      // high loads detected
                welderTimeout: 240      // time in seconds
            },
            {
                name: "10Kw",
                espSwitchPower: 1,
                espSwitchTransfer: 4,
                espVoltage: 0,
                espPower: 5,
                voltsFactor: 20.33,
                voltsRun: 53.0,
                voltsStop: 52.8,
                sunRun: 2.4,
                sunStop: 2.2,
                welderWatts: 4000,      // high loads detected
                welderTimeout: 240      // time in seconds
            },
        ],
    },
    automation = [                                                          // create an (index, clock) => {},  array member function for each automation 
        (index, clock) => {                                             // clock is declared every min.  time.sec time.min are local time, time.epoch and time.epochMin vars containing epoch time  
            if (state.auto[index] == undefined) init();
            let st = state.auto[index];                                     // set automation state object's shorthand name to "st" (state) 
            calcVoltsDC();
            gridDetection();
            //   welderDetection();
            if (state.ha != undefined && state.ha[cfg.solar.inverterAuto] == true) {
                inverterAuto();     // inverterAuto calls solarAutomation
                if (st.welder == false) solarAutomation();
            }
            // calcSolarPower() // try to map sunlight sensor to KW
            /*
            test  sensor.voltage_grid for reading (is NaN? or null) with grid switched off

            if on grid during blackout, switch to inverter if under certain voltage

            priority 2 - run pump from grid if at critical level
            runs pumps for 1hr every 24hours if at critical level 20%

            if battery is very low, turn off all pumps
            */
            function solarAutomation() {
                for (let x = 0; x < cfg.solar.priority.length; x++) {
                    if (state.ha[cfg.solar.priority[x].haAuto] == true || cfg.solar.priority[x].haAuto == undefined) {
                        if (st.priority[x] == false || st.priority[x] == null) {
                            if (state.esp[cfg.solar.espSunlight] >= cfg.solar.priority[x].onSun) {
                                if (cfg.solar.priority[x].onVolts != undefined) {
                                    if (st.voltsDC >= cfg.solar.priority[x].onVolts) {
                                        log("Sun is high and battery is enough (" + state.esp[cfg.solar.espSunlight].toFixed(2) + "v) - starting priority " + x + " devices", index, 1);
                                        send(true);
                                    }
                                } else {
                                    log("Sun is high (" + state.esp[cfg.solar.espSunlight].toFixed(2) + "v) - starting priority " + x + " devices", index, 1);
                                    send(true);
                                }
                            }
                        }
                        if (st.priority[x] == true || st.priority[x] == null) {
                            if (state.esp[cfg.solar.espSunlight] <= cfg.solar.priority[x].offSun) {
                                log("Sun is low (" + state.esp[cfg.solar.espSunlight].toFixed(2) + "v) - stopping priority " + x + " devices", index, 1);
                                send(false);
                            }
                            if (st.voltsDC <= cfg.solar.priority[x].offVolts) {
                                log("Battery is low (" + state.esp[cfg.solar.espSunlight].toFixed(2) + "v) - stopping priority " + x + " devices", index, 1);
                                send(false);
                            }
                        }
                    }
                    function send(state) {
                        for (let y = 0; y < cfg.solar.priority[x].devices.length; y++) {
                            if (cfg.solar.priority[x].devices[y].includes("input_boolean"))
                                ha.send(cfg.solar.priority[x].devices[y], state);
                            else esp.send(cfg.solar.priority[x].devices[y], state);
                        }
                        st.priority[x] = state;
                    }
                }
            }
            function inverterAuto() {
                for (let x = 0; x < cfg.inverter.length; x++) {
                    if (st.inverter[x].state == null) {                // if inverter state is unknown
                        log("initializing " + cfg.inverter[x].name + " inverter state - current state: " + state.esp[cfg.inverter[x].espSwitchTransfer], index, 1);
                        log("Battery Voltage: " + st.voltsDC.toFixed(1), index, 1);
                        st.inverter[x].state = state.esp[cfg.inverter[x].espSwitchTransfer];
                        st.inverter[x].step = time.epoh;
                        if (state.ha[cfg.solar.inverterAuto] == true) log("inverter: " + cfg.inverter[x].name + " - automation is on", index, 1);
                        else log("inverter: " + cfg.inverter[x].name + " - automation is off", index, 1);
                    }
                    if (st.inverter[x].state == true) {                 // if inverter is already on
                        if (cfg.inverter[x].sunStop != undefined && st.inverter[x].nightTime == false) {    // if light level stop is configed
                            if (state.esp[cfg.solar.espSunlight] <= cfg.inverter[x].sunStop) {              // if sunlight is low
                                if (cfg.inverter[x].nightTime == true) {              // if clock data
                                    if (time.hour == cfg.inverter[x].nighTimeStartHour) {                   // if nighttime match
                                        if (cfg.inverter[x].nighTimeStartMin != undefined) {
                                            if (time.min >= cfg.inverter[x].nighTimeStartMin) { isNight(); return; }
                                        } else { isNight(); return; }
                                    }
                                    else if (time.hour > cfg.inverter[x].nighTimeStartHour) {
                                        isNight(); return;
                                    }
                                } else {        // if sun is low and not nighttime - switch the inverter off  -- save battery wear
                                    log("Sun is low: " + state.esp[cfg.solar.espSunlight].toFixed(2) + "  Volts: " + st.voltsDC.toFixed(1)
                                        + ", " + cfg.inverter[x].name + " is switching to grid ", index, 2);
                                    inverterPower(x, false);
                                }
                            }
                        }
                        if (st.voltsDC <= cfg.inverter[x].voltsStop) {  // when battery is low
                            log("Battery is low: " + st.voltsDC.toFixed(1) + ", " + cfg.inverter[x].name + " is switching to grid ", index, 2);
                            inverterPower(x, false);
                        }
                        if (st.voltsDC >= cfg.inverter[x].voltsRun && state.esp[cfg.solar.espSunlight] >= cfg.inverter[x].sunRun) {  // when battery begins to charge
                            log("Battery is charging: " + st.voltsDC.toFixed(1) + ", " + cfg.inverter[x].name + " exiting night mode", index, 1);
                            st.inverter[x].nightTime = false;
                        }
                    } else {    // when inverter is switched off
                        if (st.voltsDC >= cfg.inverter[x].voltsRun) {
                            if (cfg.inverter[x].sunRun != undefined) {
                                if (state.esp[cfg.solar.espSunlight] >= cfg.inverter[x].sunRun) {  // when battery begins to charge
                                    log("Battery is charging, sun is high: " + st.voltsDC.toFixed(1) + ", " + cfg.inverter[x].name + " switching on", index, 1);
                                    inverterPower(x, true);
                                }
                            } else {
                                log("Battery is charging: " + st.voltsDC.toFixed(1) + ", " + cfg.inverter[x].name + " switching on", index, 1);
                                inverterPower(x, true);
                            }
                        }
                        if (cfg.inverter[x].nightTime == true && st.inverter[x].nightTime == false) {
                            if (time.hour = cfg.inverter[x].nighTimeStartHour) {
                                if (cfg.inverter[x].nighTimeStartMin != undefined) {
                                    if (time.min >= cfg.inverter[x].nighTimeStartMin) { isNight(true); return; }
                                } else { isNight(); return; }
                            }
                            if (time.hour > cfg.inverter[x].nighTimeStartHour) { isNight(true); return; }
                        }
                    }
                    function isNight(power) {
                        log("its late: (" + state.esp[cfg.solar.espSunlight].toFixed(2) + "v sunlight)  Volts: " + st.voltsDC.toFixed(1) + ", "
                            + cfg.inverter[x].name + ", is entering night mode ", index, 1);
                        st.inverter[x].nightTime = true;
                        if (power === true) inverterPower(x, true);
                    }
                }
                function inverterPower(x, run) {
                    if (run == true) {
                        if (cfg.inverter[x].espSwitchPower == undefined) esp.send(cfg.esp[cfg.inverter[x].espSwitchTransfer], run);
                        else {
                            esp.send(cfg.esp[cfg.inverter[x].espSwitchPower], run);
                            setTimeout(() => { esp.send(cfg.esp[cfg.inverter[x].espSwitchTransfer], run); }, 5e3);
                        }
                    } else {
                        if (cfg.inverter[x].espSwitchPower == undefined) esp.send(cfg.esp[cfg.inverter[x].espSwitchTransfer], run);
                        else {
                            esp.send(cfg.esp[cfg.inverter[x].espSwitchTransfer], run);
                            setTimeout(() => { esp.send(cfg.esp[cfg.inverter[x].espSwitchPower], run); }, 3e3);
                        }
                    }
                    st.inverter[x].state = run;
                }
            }
            function calcVoltsDC() {
                let sunConverted = (state.esp[10] * 100).toFixed(0);
                let solarPower = Math.round(state.esp[16] + state.esp[14] + state.esp[5]);
                //   if (st.sunlight[state.esp[10]].high == undefined) 
                //      ha.send("solar_power", Math.round(solarPower), "w");
                ha.send("solar_power2", Math.round(solarPower), "W");
                st.voltsDC = state.esp[cfg.inverter[0].espVoltage] * cfg.inverter[0].voltsFactor;
                //    ha.send("volts_dc_Battery", parseFloat(st.voltsDC).toFixed(2), "v");
                ha.send("volts_dc_Battery2", parseFloat(st.voltsDC).toFixed(2), "V");
            }
            function welderDetection() {
                if (state.esp[cfg.inverter[0].espPower] >= cfg.inverter[0].welderWatts ||  // check inverter meter
                    state.esp[cfg.grid.espPower] >= cfg.inverter[0].welderWatts) {           // check grid meter
                    st.welderStep = time.epoh;                   // extend welter timeout if still heavy loads
                    if (st.welder == false) {
                        log("welder detected: " + state.esp[cfg.inverter[0].espPower].toFixed() + "w - shutting down all pumps", index, 2);
                        st.welder = true;
                        st.priority[0] = false;
                        ha.send("input_boolean.auto_compressor", false);
                        ha.send("input_boolean.auto_pump_transfer", false);
                        //    esp.send("uth-relay1", false);
                        // turn on fan
                    }
                } else {
                    if (st.welder == true && time.epoh - st.welderStep >= cfg.inverter[0].welderTimeout) {
                        log("welder not detected: " + state.esp[cfg.inverter[0].espPower].toFixed() + "w", index, 1);
                        st.welder = false;
                    }
                }
            }
            function gridDetection() {
                if (state.esp[cfg.grid.espVoltage] == null) {   // when grid is offline
                    if (st.grid.state == true) {
                        log("grid blackout", index, 2);
                        st.grid.state = false;
                        st.grid.step = time.epoh;                // grid statistics , save to nv
                        ha.send("voltage_grid", 0, "V");
                    }
                } else {
                    if (st.grid.state == null) {
                        log("grid is online", index, 1);
                        ha.send("voltage_grid", state.esp[cfg.grid.espVoltage].toFixed(0), "V");
                        st.grid.state = true;
                    }
                    if (st.grid.state == false) {
                        // global function to give h m s?
                        // log grid blackout statistics
                        // log sunlight daily index
                        log("grid back online, offline for: " + time.epoh - st.grid.step + "s", index, 2);
                        st.grid.state = true;
                        ha.send("voltage_grid", 0, "V");
                    }
                }
            }
            if (clock) {
                var day = clock.day, dow = clock.dow, hour = clock.hour, min = clock.min;
                if (hour == 8 && min == 0) {
                    esp.send("power1-relay2", true); // fan
                }
                if (hour == 17 && min == 0) {
                    esp.send("power1-relay2", false); // fan
                }
            };
            function init() {
                state.auto.push({                                           // create object for this automation, 
                    name: "Solar",                                          // give this automation a name 
                    voltsDC: null,
                    inverter: [],
                    grid: { state: null, step: time.epoh },
                    welder: false,
                    welderStep: null,
                    priority: [],                                 // priority states
                    sunlight: [],
                });
                for (let x = 0; x < cfg.inverter.length; x++) state.auto[index].inverter.push({ state: null, step: null, nightTime: false });
                for (let x = 0; x < cfg.solar.priority.length; x++) state.auto[index].priority.push(null);
                setInterval(() => { automation[index](index); }, 1e3);      // set minimum rerun time, otherwise this automation function will only on ESP and HA events
                emitters();
                log("automation system started", index, 1);                 // log automation start with index number and severity 
                send("coreData", { register: true, name: "tank_lth" });      // register with core to receive sensor data
            }
            function emitters() {
                for (let x = 0; x < cfg.inverter.length; x++) {
                    em.on(cfg.esp[cfg.inverter[x].espSwitchTransfer], (newState) => {   // keep inverter state synced to automation state
                        log("inverter " + cfg.inverter[x].name + " ESP state changed - new state: " + newState, index, 1);
                        st.inverter[x].state = newState;
                        if (cfg.inverter[x].espSwitchPower == undefined) esp.send(cfg.esp[cfg.inverter[x].espSwitchTransfer], newState);
                    });
                }
                em.on("input_boolean.auto_inverter", (newState) => {
                    if (newState == true) log("inverter auto going online", index, 1);
                    else log("inverter auto going offline", index, 1);
                });
                for (let x = 0; x < cfg.solar.priority.length; x++) {               // sync priority device state with auto state
                    em.on(cfg.ha[cfg.solar.priority[x].haAuto], (newState) => {
                        if (newState == true) {
                            log("solar automation priority" + x + " going online", index, 1);
                        }
                        else {
                            log("inverter auto priority " + x + " going offline", index, 1);
                            st.priority[x] = false;
                        }
                    });
                }
            }
            function calcSolarPower() {
                if (st.sunlight[sunConverted] == undefined) {
                    //   log("creating new solar power index: " + sunConverted, index, 1);
                    st.sunlight[sunConverted] = { low: solarPower, high: solarPower, average: null };
                } else {
                    if (solarPower < st.sunlight[sunConverted].low) {
                        st.sunlight[sunConverted].low = solarPower;
                        st.sunlight[sunConverted].average = Math.round(st.sunlight[sunConverted].low + st.sunlight[sunConverted].high / 2);
                        //     log("solar power index: " + sunConverted + "  low is being updated: " + solarPower + "  new average: " + st.sunlight[sunConverted].average, index, 1);
                    }
                    if (solarPower > st.sunlight[sunConverted].high) {
                        st.sunlight[sunConverted].high = solarPower;
                        st.sunlight[sunConverted].average = Math.round(st.sunlight[sunConverted].low + st.sunlight[sunConverted].high / 2);
                        //    log("solar power index: " + sunConverted + "  high is being updated: " + solarPower + "  new average: " + st.sunlight[sunConverted].average, index, 1);
                    }
                }
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
    sys = {         // ______________________system area, don't need to touch anything below this line__________________________________
        com: function () {
            udp.on('message', function (data, info) {
                time.sync();   // sync the time.  time.epoch time.min are global vars containing epoch time  
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
                        case "coreData":
                            exist = false;
                            coreDataNum = null;
                            for (let x = 0; x < state.coreData.length; x++) {
                                if (state.coreData[x].name == buf.obj.name) {
                                    state.coreData[x].data = JSON.parse(data);
                                    exist = true;
                                    break;
                                }
                            }
                            if (exist == false) {
                                coreDataNum = state.coreData.push({ name: buf.obj.name, data: JSON.parse(data).data }) - 1;
                                log("coreData:" + coreDataNum + " - is registering: " + buf.obj.name + " - " + buf.obj.data);
                            }
                            break;
                        case "diag":                // incoming diag refresh request, then reply object
                            send("diag", { state: state, nv: nv });
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
            state = { auto: [], ha: [], esp: [], coreData: [], onlineHA: false, onlineESP: false, online: false };
            time = {
                mil: null, sec: null, min: null, hour: null, day: null, week: null, epoch: null, epochMin: null, epochMil: null,
                sync: function () {
                    let date = new Date();
                    this.epoch = Math.floor(Date.now() / 1000);
                    this.epochMil = Math.floor(Date.now());
                    this.epochMin = Math.floor(Date.now() / 1000 / 60);
                    this.day = date.getDay();
                    this.hour = date.getHours();
                    this.min = date.getMinutes();
                    this.sec = date.getSeconds();
                    this.mil = date.getMilliseconds();
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
                    "Description=",
                    "After=network-online.target",
                    "Wants=network-online.target\n",
                    "[Install]",
                    "WantedBy=multi-user.target\n",
                    "[Service]",
                    "ExecStartPre=/bin/bash -c 'uptime=$(awk \\'{print int($1)}\\' /proc/uptime); if [ $uptime -lt 300 ]; then sleep 70; fi'",
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
function coreData(name) {
    for (let x = 0; x < state.coreData.length; x++) if (state.coreData[x].name == name) return state.coreData[x].data;
    return {};
}
function log(message, index, level) {
    if (level == undefined) send("log", { message: message, mod: cfg.moduleName, level: index });
    else send("log", { message: message, mod: state.auto[index].name, level: level });
}
