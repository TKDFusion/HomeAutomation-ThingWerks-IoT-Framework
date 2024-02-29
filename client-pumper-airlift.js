#!/usr/bin/node
let
    cfg = {
        moduleName: "Pumper",
        workingDir: "/apps/tw/",
        telegram: {
            password: "test",
        },
        ha: [
            "input_boolean.auto_compressor",
            "input_boolean.compressor_timer",
        ],
        esp: [
            "raw-tank-lth",
            "relay1",
        ],
        dd: [       // config for the Demand/Delivery automation function, 1 object for each pump system
            {   // DD system 2 example
                name: "LTH-Well",       // Demand Delivery system name
                ha: {
                    auto: 0,              // home assistant auto toggle ID number (specified below in cfg.ha config)
                    timer: 1,
                },
                pump: [
                    {
                        id: 1,                  
                        type: "esp",
                        class: "single",
                        name: "Compressor",
                    },
                ],
                press: {                // pressure sensor number (in press block)
                    output: 0,
                    input: undefined
                },
                flow: {
                    id: undefined,
                    startWarn: 70,      // min start flow before triggering notification (useful for filters)
                    startError: 20,     // minimum flow rate pump must reach at start
                    startWait: 6,       // seconds to wait before checking flow after pump starts
                },
                fault: {
                    retry: 10,          // time in seconds to wait for retry
                    retryFinal: 2,      // time in minutes to wait for final retry
                    runLong: 10,        // max run time
                    cycleCount: 3,      // max cycle times per cycleTime window
                    cycleTime: 120,     // max cycleTime time window  (in seconds)
                },
            },
        ],
        press: [     // config for tanks used with Home Assistant -- these tanks get sent back to HA as sensors
            {   // Tank 1 example
                name: "tank_lth",       // tank name (do not use spaces or dash, underscore only)
                unit: "m",              // measurement unit (i.e. PSI or meters) "m" or "psi" only
                type: "esp",            // the sensor ID in "ha" or "esp" block
                id: 0,                  // HA or ESP ID number, corresponds to array number (zero indexed) 
                stop: 3.98,             // Demand Delivery system stop level in (meters) or PSI
                start: 3.95,            // Demand Delivery system start level (meters) or PSI
                warn: 2.75,             // threshold to send warning notification
                average: 5,             // amount of samples to average over
                voltageMin: 0.475,      // calibration, minimum value when sensor is at atmospheric pressure 
                pressureRating: 15,     // max rated pressure of transducer in PSI
            },
        ],
        flow: [      // config for flow meters used with Home Assistant -- these flow meters get sent back to HA as sensors
            {   // flow meter 1 example
                name: "flow",           // flow meter name that will appear in HA as a sensor (do not use spaces or dash, underscore only)
                type: "esp",            // the sensor is "ha" or "esp" 
                id: 2,                  // HA or ESP ID number, corresponds to array number (zero indexed) 
                pulse: 0.2,             // pulse calculation factor for your specific flow meter
                unit: "m3",             // unit of measurement (cubic meters)
            }
        ],
    },
    automation = [
        (index, clock) => {
            time.sync();
            if (state.auto[index] == undefined) init();
            if (clock) {    // called every minute
                var day = clock.day, dow = clock.dow, hour = clock.hour, min = clock.min;
                if (hour == 8 && min == 0) {
                    if (state.ha[cfg.dd[0].ha.timer] == true) ha.send("input_boolean.auto_compressor", true);
                }
                if (hour == 18 && min == 0) {
                    if (state.ha[cfg.dd[0].ha.timer] == true) ha.send("input_boolean.auto_compressor", false);
                }
                if (hour == 7 && min == 30) {
                    for (let x = 0; x < cfg.dd.length; x++) { state.auto[index].dd[x].warn.flowDaily = false; } // reset low flow daily warning
                }
                calcFlowMeter();
                sys.file.write.nv();
                for (let x = 0; x < cfg.dd.length; x++) { state.auto[index].dd[x].warn.flowFlush = false; }
            }
            for (let x = 0; x < cfg.dd.length; x++) {   // enumerate every demand delivery instance
                let dd = state.auto[index].dd[x];
                pointers();
                if (dd.state.listener == undefined) listener();     // setup HA/ESP Input event listeners
                switch (dd.auto.state) {
                    case true:                  // when Auto System is ONLINE
                        switch (dd.state.run) {
                            case false:         // when pump is STOPPED (local perspective)
                                switch (dd.fault.flow) {
                                    case false: // when pump is STOPPED and not flow faulted
                                        if (((dd.press.out.cfg.unit == "m") ? dd.press.out.state.meters : dd.press.out.state.psi) <= dd.press.out.cfg.start) {
                                            log(dd.cfg.name + " - " + dd.press.out.cfg.name + " is low (" + dd.press.out.state.meters.toFixed(2) + "m) - pump is starting", index, 1);
                                            pumpStart(true);
                                            return;
                                        }
                                        if (dd.state.timeoutOff == true) {  // after pump has been off for a while
                                            if (dd.pump[0].state === true) {
                                                log(dd.cfg.name + " - pump running in HA/ESP but not here - switching pump ON", index, 1);
                                                pumpStart(true);
                                                return;
                                            } else {
                                                if (dd.flow != undefined && dd.flow.lm > dd.cfg.flow.startError && dd.warn.flowFlush == false) {
                                                    log(dd.cfg.name + " - flow is detected (" + dd.flow.lm.toFixed(0) + "lpm) possible sensor damage or flush operation", index, 2);
                                                    dd.warn.flowFlush = true;
                                                    log(dd.cfg.name + " - shutting down auto system", index, 1);
                                                    ha.send(dd.auto.name, false);
                                                    dd.auto.state = false;
                                                    pumpStop();
                                                    return;
                                                }
                                            }
                                        }
                                        break;
                                    case true:  // when pump is STOPPED and flow faulted but HA/ESP home report as still running
                                        if (dd.state.timeoutOff == true) {
                                            if (dd.pump[0].state === true || dd.flow != undefined && dd.flow.lm > dd.cfg.flow.startError) {
                                                log(dd.cfg.name + " - pump is flow faulted but HA pump status is still ON, trying to stop again", index, 3);
                                                ha.send(dd.auto.name, false);
                                                dd.auto.state = false;
                                                pumpStop();
                                                return;
                                            }
                                        }
                                        break;
                                }
                                break;
                            case true:      // when pump is RUNNING
                                if (((dd.press.out.cfg.unit == "m") ? dd.press.out.state.meters : dd.press.out.state.psi) >= dd.press.out.cfg.stop) {
                                    log(dd.cfg.name + " - " + dd.press.out.cfg.name + " is full - pump is stopping", index, 1);
                                    pumpStop();
                                    return;
                                }
                                if (time.sec - dd.state.timerRun >= dd.cfg.fault.runLong * 60) {
                                    log(dd.cfg.name + " - pump: " + dd.pump[0].name + " - max runtime exceeded - DD system shutting down", index, 3);
                                    ha.send(dd.auto.name, false);
                                    dd.auto.state = false;
                                }
                                if (dd.state.flowCheck == true && dd.flow != undefined) {
                                    if (dd.flow.lm < dd.cfg.flow.startError) {
                                        dd.fault.flow = true;
                                        if (dd.fault.flowRestarts < 3) {
                                            log(dd.cfg.name + " - flow check FAILED!! (" + dd.flow.lm.toFixed(1) + "lm) HA Pump State: "
                                                + dd.pump[0].state + " - waiting for retry " + (dd.fault.flowRestarts + 1), index, 2);
                                            dd.fault.flowRestarts++;
                                            flowTimer[x] = setTimeout(() => {
                                                dd.fault.flow = false; log(dd.cfg.name + " - pump restating", index, 1);
                                            }, dd.cfg.fault.retry * 1000);
                                        } else if (dd.fault.flowRestarts == 3) {
                                            log(dd.cfg.name + " - low flow (" + dd.flow.lm.toFixed(1) + "lm) HA State: "
                                                + dd.pump[0].state + " - retries exceeded - going offline for " + dd.cfg.fault.retryFinal + "m", index, 3);
                                            dd.fault.flowRestarts++;
                                            flowTimer[x] = setTimeout(() => {
                                                dd.fault.flow = false; log(dd.cfg.name + " - pump restating", index, 1);
                                            }, dd.cfg.fault.retryFinal * 60 * 1000);
                                        }
                                        else {
                                            dd.fault.flowRestarts++;
                                            log(dd.cfg.name + " - low flow (" + dd.flow.lm.toFixed(1) + "lm) HA State: "
                                                + dd.pump[0].state + " - all retries failed - going OFFLINE permanently", index, 3);
                                            ha.send(dd.auto.name, false);
                                            dd.auto.state = false;
                                        }
                                        pumpStop();
                                    } else {
                                        if (dd.state.flowCheckPassed == false) {
                                            log(dd.cfg.name + " - pump flow check PASSED (" + dd.flow.lm.toFixed(1) + "lm)", index, 1);
                                            dd.state.flowCheckPassed = true;
                                            dd.fault.flowRestarts = 0;
                                            if (dd.flow.lm < dd.cfg.flow.startWarn && dd.warn.flowDaily == false) {
                                                dd.warn.flowDaily = true;
                                                log(dd.cfg.name + " - pump flow is lower than optimal (" + dd.flow.lm.toFixed(1) + "lm) - clean filter", index, 2);
                                            }
                                        }
                                    }
                                }
                                if (dd.flow == undefined && dd.state.timeoutOn == true && dd.pump[0].state === false) {
                                    log(dd.cfg.name + " - is out of sync - auto is on, system is RUN but pump is off", index, 2);
                                    pumpStart(true);
                                    return;
                                }
                                break;
                        }
                        if (dd.warn.tankLow != undefined && dd.press.out.state.meters <= (dd.press.out.cfg.warn) && dd.warn.tankLow == false) {
                            log(dd.cfg.name + " - " + dd.press.out.cfg.name + " is lower than expected (" + dd.press.out.state.meters.toFixed(2)
                                + dd.press.out.cfg.unit + ") - possible hardware failure or low performance", index, 2);
                            dd.warn.tankLow = true;
                        }
                        break;
                    case false:  // when auto is OFFLINE
                        if (dd.state.timeoutOff == true) {
                            if (dd.pump[0].state === true) {
                                log(dd.cfg.name + " - is out of sync - auto is off but pump is on - switching auto ON", index, 2);
                                ha.send(dd.auto.name, true);
                                dd.auto.state = true;
                                pumpStart();
                                return;
                            }
                            if (dd.flow != undefined && dd.flow.lm > dd.cfg.flow.startError && dd.warn.flowFlush == false) {
                                dd.warn.flowFlush = true;
                                log(dd.cfg.name + " - Auto is off but flow is detected (" + dd.flow.lm.toFixed(1) + ") possible sensor damage or flush operation", index, 2);
                                if (dd.pump[0].state === null || dd.pump[0].state == true) pumpStop();
                                return;
                            }
                        }
                        break;
                }
                if (dd.press.out.state.meters >= (dd.press.out.cfg.stop + .12) && dd.fault.flowOver == false) {
                    log(dd.cfg.name + " - " + dd.press.out.cfg.name + " is overflowing (" + dd.press.out.state.meters
                        + dd.press.out.cfg.unit + ") - possible SSR or hardware failure", index, 3);
                    pumpStop();
                    dd.fault.flowOver = true;
                }
                function pumpStart(sendOut) {
                    if (dd.state.cycleCount == 0) {
                        dd.state.cycleTimer = time.sec;
                    } else if (dd.state.cycleCount > dd.cfg.fault.cycleCount) {
                        if (time.sec - dd.state.cycleTimer < dd.cfg.fault.cycleTime) {
                            log(dd.cfg.name + " - pump is cycling to frequently - DD system shutting down", index, 3);
                            ha.send(dd.auto.name, false);
                            dd.auto.state = false;
                            return;
                        } else { dd.state.cycleTimer = time.sec; dd.state.cycleCount = 0; }
                    }
                    dd.state.cycleCount++;
                    if (dd.flow != undefined) { dd.flow.batch = nv.flow[dd.cfg.flow.id].total; }
                    dd.fault.flow = false;
                    dd.state.run = true;
                    dd.state.timerRun = time.sec;
                    dd.state.flowCheck = false;
                    dd.state.flowCheckPassed = false;
                    dd.state.timeoutOn = false;
                    setTimeout(() => { dd.state.timeoutOn = true }, 10e3);
                    setTimeout(() => {
                        //    log(dd.cfg.name + " - checking pump flow", 2);
                        dd.state.flowCheck = true;
                        automation[index](index);
                    }, dd.cfg.flow.startWait * 1000);
                    dd.state.sendRetries = 0;
                    if (sendOut) {
                        if (dd.pump[0].cfg.type == "ha") ha.send(cfg.ha[dd.pump[0].id], true); // if no "sendOut" then auto system is syncing state with HA/ESP
                        else esp.send(dd.pump[0].name, true);
                        log(dd.cfg.name + " - starting pump: " + dd.pump[0].name + " - cycle count: "
                            + dd.state.cycleCount + "  Time: " + (time.sec - dd.state.cycleTimer), index, 1);
                    }
                }
                function pumpStop() {
                    let
                        runTime = time.sec - dd.state.timerRun,
                        hours = Math.floor(runTime / 60 / 60),
                        minutes = Math.floor(runTime / 60),
                        extraSeconds = runTime % 60;
                    let lbuf = dd.cfg.name + " - stopping pump: " + dd.pump[0].name + " - Runtime: " + hours + "h:" + minutes + "m:" + extraSeconds + "s";
                    if (dd.flow != undefined) {
                        let tFlow = nv.flow[dd.cfg.flow.id].total - dd.flow.batch;
                        log(lbuf + " - pumped " + tFlow.toFixed(2) + "m3 - Average: "
                            + ((tFlow * 1000) / (time.sec - dd.state.timerRun) * 60).toFixed(1) + "lm", index, 1);
                    }
                    else log(lbuf, index, 1);
                    dd.state.timeoutOff = false;
                    dd.state.run = false;
                    dd.pump[0].state = false;
                    if (dd.pump[0].cfg.type == "ha") ha.send(cfg.ha[dd.pump[0].id], false);
                    else esp.send(dd.pump[0].name, false);
                    setTimeout(() => { dd.state.timeoutOff = true }, 10e3);
                }
                function listener() {
                    log(dd.cfg.name + " - creating event listeners", index, 1);
                    em.on(dd.auto.name, function (data) {
                        time.sync();
                        switch (data) {
                            case true:
                                log(dd.cfg.name + " - is going ONLINE", index, 1);
                                dd.auto.state = true;
                                dd.fault.flow = false;
                                dd.fault.flowRestarts = 0;
                                dd.warn.tankLow = false;
                                dd.state.cycleTimer = time.sec;
                                dd.state.cycleCount = 0;
                                return;
                            case false:
                                log(dd.cfg.name + " - is going OFFLINE - pump is stopping", index, 1);
                                dd.auto.state = false;
                                clearTimeout(flowTimer[x]);
                                pumpStop();
                                return;
                        }
                        return;
                    });
                    dd.state.listener = true;
                    return;
                }
                function pointers() {
                    for (let y = 0; y < cfg.dd[x].pump.length; y++) {
                        dd.pump[y].state = state.esp[cfg.dd[x].pump[y].id];
                        if (cfg.dd[x].pump[y].type == "esp") {
                            dd.pump[y].state = state.esp[cfg.dd[x].pump[y].id];
                        } else if (cfg.dd[x].pump[y].type == "ha") {
                            dd.pump[y].state = state.ha[cfg.dd[x].pump[y].id];
                        }
                    }
                }
            }
            function init() {
                state.auto.push({               // initialize automation volatile memory
                    name: "Pumper", dd: [], flow: [], press: [], ha: { pushLast: [] },
                });
                if (cfg.flow != undefined) {
                    if (nv.flow == undefined) {             // initialize flow meter NV memory if no NV data
                        log("initializing flow meter data...", index, 1);
                        nv.flow = [];
                        for (let x = 0; x < cfg.flow.length; x++) {
                            nv.flow.push({ total: 0, min: [], hour: [], day: [] })
                            for (let y = 0; y < 60; y++) nv.flow[x].min.push(0);
                            for (let y = 0; y < 24; y++) nv.flow[x].hour.push(0);
                            for (let y = 0; y < 30; y++) nv.flow[x].day.push(0);
                        }
                        log("writing NV data to disk...", index, 1);
                        sys.file.write.nv();
                    }
                    for (let x = 0; x < cfg.flow.length; x++) {
                        state.auto[index].flow.push({ lm: 0, temp: undefined, hour: 0, day: 0, batch: 0 })
                    }
                }
                if (cfg.press != undefined) {
                    for (let x = 0; x < cfg.press.length; x++) {
                        state.auto[index].press.push({ raw: [], step: 0, meters: null, psi: null, percent: null, volts: null, })
                    }
                }
                for (let x = 0; x < cfg.dd.length; x++) {
                    log(cfg.dd[x].name + " - initializing", index, 1);
                    flowTimer = [];
                    state.auto[index].dd.push({     // initialize volatile memory for each Demand Delivery system
                        cfg: cfg.dd[x],
                        state: {
                            run: false,
                            flowCheck: false,
                            flowCheckPassed: false,
                            timeoutOff: true,
                            timeoutOn: false,
                            cycleCount: 0,
                            timerRun: null
                        },
                        fault: {
                            flow: false,
                            flowRestarts: 0,
                            flowOver: false,
                        },
                        warn: {
                            flow: false,
                            flowDaily: false,
                            flowFlush: false,
                            haLag: false,
                            tankLow: false,
                        },
                        auto: { state: state.ha[cfg.dd[x].ha.auto], name: cfg.ha[cfg.dd[x].ha.auto] },
                        press: {
                            in: {},
                            out: (cfg.dd[x].press.output != undefined) ? {
                                cfg: cfg.press[cfg.dd[x].press.output],
                                state: state.auto[index].press[cfg.press[cfg.dd[x].press.output].id]
                            } : undefined,
                        },
                        flow: (cfg.dd[x].flow.id != undefined) ? state.auto[index].flow[cfg.dd[x].flow.id] : undefined,
                        pump: [],
                    })
                    for (let y = 0; y < cfg.dd[x].pump.length; y++) {
                        if (cfg.dd[x].pump[y].type == "esp") {
                            state.auto[index].dd[x].pump.push({
                                cfg: cfg.dd[x].pump[y],
                                state: state.esp[cfg.dd[x].pump[y].id],
                                name: cfg.esp[cfg.dd[x].pump[y].id]
                            })
                        } else if (cfg.dd[x].pump[y].type == "ha") {
                            state.auto[index].dd[x].pump.push({
                                cfg: cfg.dd[x].pump[y],
                                state: state.ha[cfg.dd[x].pump[y].id],
                                name: cfg.ha[cfg.dd[x].pump[y].id]
                            })
                        }
                    }
                }
                calcFlow();
                calcFlowMeter();
                pushSensor();
                setInterval(() => {     // called every hour  -  reset hourly notifications
                    for (let x = 0; x < cfg.dd.length; x++) {
                        state.auto[index].dd[x].fault.flowOver = false;
                        state.auto[index].dd[x].warn.tankLow = false;
                    }
                }, 3600e3);
                setInterval(() => {     // called every second  -  rerun this automation every second
                    automation[index](index);
                    calcFlow();
                    pushSensor();
                }, 1e3);
            }
            function pushSensor() {
                let sendDelay = 0;
                let list = ["_total", "_hour", "_day", "_lm"];
                let pos = 0;
                //              if (state.ha.ws.online == true) {
                for (let x = 0; x < cfg.flow.length; x++) {
                    let unit = [cfg.flow[x].unit, cfg.flow[x].unit, cfg.flow[x].unit, "L/m"]
                    let value = [nv.flow[x].total, state.auto[index].flow[x].hour, state.auto[index].flow[x].day, state.auto[index].flow[x].lm];
                    for (let y = 0; y < 4; y++) {
                        if (state.auto[index].ha.pushLast[pos] == undefined) {
                            state.auto[index].ha.pushLast.push(Number(value[y]).toFixed(2));
                            send(cfg.flow[x].name + list[y], Number(value[y]).toFixed(2), unit[y]);
                        } else if (state.auto[index].ha.pushLast[pos] != Number(value[y]).toFixed(2)) {
                            state.auto[index].ha.pushLast[pos] = (Number(value[y]).toFixed(2));
                            send(cfg.flow[x].name + list[y], Number(value[y]).toFixed(2), unit[y]);
                        }
                        pos++;
                    }
                }
                for (let x = 0; x < cfg.press.length; x++) {
                    let calc = { percent: [], sum: 0 }, press = {
                        cfg: cfg.press[x], state: (cfg.press[x].type == "esp")
                            ? state.esp[cfg.press[x].id] : state.ha[cfg.press[x].id],
                        out: state.auto[index].press[x]
                    };
                    if (press.out.step < press.cfg.average) { press.out.raw[press.out.step++] = press.state; }
                    else { press.out.step = 0; press.out.raw[press.out.step++] = press.state; }
                    for (let y = 0; y < press.out.raw.length; y++) calc.sum += press.out.raw[y];
                    calc.average = calc.sum / press.out.raw.length;
                    if (press.cfg.voltageMin == 0.5) log("sensor ID: " + x + " is uncalibrated - Average Volts: "
                        + calc.average.toFixed(3) + "  - WAIT " + press.cfg.average + " seconds", index, 1);
                    calc.psi = (press.cfg.pressureRating / 4) * (calc.average - press.cfg.voltageMin);
                    calc.meters = 0.703249 * calc.psi;
                    calc.percent[0] = press.cfg.stop - calc.meters;
                    calc.percent[1] = calc.percent[0] / press.cfg.stop;
                    calc.percent[2] = Math.round(100 - (calc.percent[1] * 100));
                    press.out.volts = Number(calc.average.toFixed(3));
                    press.out.psi = (calc.psi < 0.0) ? 0 : Number(calc.psi.toFixed(2));
                    press.out.meters = (calc.meters < 0.0) ? 0 : Number(calc.meters.toFixed(2));
                    press.out.percent = (calc.percent[2] < 0.0) ? 0 : calc.percent[2];
                    send(press.cfg.name + "_percent", press.out.percent.toFixed(0), '%');
                    send(press.cfg.name + "_meters", press.out.meters.toFixed(2), 'm');
                    send(press.cfg.name + "_psi", press.out.psi.toFixed(2), 'psi');
                }
                function send(name, value, unit) { setTimeout(() => { ha.send(name, value, unit) }, sendDelay); sendDelay += 25; }
            }
            function calcFlow() {
                for (let x = 0; x < cfg.flow.length; x++) {
                    if (cfg.flow[x].type == "esp") state.auto[index].flow[x].lm = state.esp[cfg.flow[x].id] / cfg.flow[x].pulse / 60;
                    else state.auto[index].flow[x].lm = state.ha[cfg.flow[x].id] / cfg.flow[x].pulse / 60;
                    if (!isNaN(parseFloat(state.auto[index].flow[x].lm)) == true && isFinite(state.auto[index].flow[x].lm) == true && state.auto[index].flow[x].lm != null)
                        nv.flow[x].total += state.auto[index].flow[x].lm / 60 / 1000;
                }
            }
            function calcFlowMeter() {
                let calcFlow = 0, calcHour = 0, calcDay = 0, hourNV = 0;
                for (let x = 0; x < cfg.flow.length; x++) {
                    if (state.auto[index].flow[x].temp == undefined) state.auto[index].flow[x].temp = nv.flow[x].total
                    if (state.auto[index].flow[x].temp != nv.flow[x].total) {
                        calcFlow = nv.flow[x].total - state.auto[index].flow[x].temp;
                        state.auto[index].flow[x].temp = nv.flow[x].total;
                    }
                    nv.flow[x].min[min] = calcFlow;

                    nv.flow[x].min.forEach((y) => calcHour += y);
                    state.auto[index].flow[x].hour = calcHour;

                    for (let y = 0; y <= min; y++) calcDay += nv.flow[x].min[y];
                    nv.flow[x].hour.forEach((y) => calcDay += y);
                    calcDay = calcDay - nv.flow[x].hour[hour];
                    state.auto[index].flow[x].day = calcDay;

                    for (let y = 0; y < 60; y++) hourNV += nv.flow[x].min[y];
                    nv.flow[x].hour[hour] = hourNV;
                }
            }
        },
    ];
let
    user = {        // user configurable block - Telegram 
        telegram: { // enter a case matching your desireable input
            agent: function (msg) {
                //  log("incoming telegram message: " + msg, 0, 0);
                //  console.log("incoming telegram message: ", msg);
                if (sys.telegram.auth(msg)) {
                    switch (msg.text) {
                        case "?": console.log("test help menu"); break;
                        case "/start": bot(msg.chat.id, "you are already registered"); break;
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
