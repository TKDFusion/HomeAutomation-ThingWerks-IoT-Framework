*If you have a question, please open a dialog in the “issue” section so others can benefit from the discussion.*

*This project is interested in collaborating with integration of the Zigbee2mqtt NodeJS API* https://www.npmjs.com/package/zigbee2mqtt 

## See Getting Started for step by step instructions
https://github.com/thwerks/ThingWerks-IoT-Frmework/blob/main/Readme-Getting-Started.md 

### Preamble:
This framework was built with Home Assistant GUI and ESPHome in mind but they arnt required. This is an industrial automation and contorl framework. It has a Core which facilitates HomeAssitant, ESP, Telegram, Client Automation and interclient communication. The Clients connect to the Core for data and perform the logic and control via the devices connected to the Core. 

### General Concept of ThingWerks:
ThingWerks is an ultra-lightweight IoT Automation Framework for NodeJS, intended to enable users to swiftly create automation scripts in NodeJS. Tailored for both industrial and home automation projects, its primary goal is to expedite the setup of a basic automation system with HomeAssistant funcitoning only as a GUI.

Ready made industrial TW-Client automations are included here in this repo such as PumperPro, SolarWerks, and soon WaterWerks Daslinator. 

### Design Principals:
TW-Core serves as the central hub for handling communication, system management and IoTsystem functions. On the other hand, the TW-Client is very light, containing only essential code to communicate with the Core, making it the designated space for your automation code. This separation is to enhance system reliability and simplicity. By compartmentalizing responsibilities.

### Relationship with Home Assistant:
This framework utilizes Home Assistant's robust GUI, smartphone app, and monitoring capabilities for NodeJS automations, offering a more reliable, flexible, and responsive approach than relying on Home Assistant for complex tasks. Coding basic logic in JavaScript is argued to be simpler than using the GUI or YAML.

While Home Assistant excels in certain scenarios, it is unsuitable for industrial applications, where malfunctions can cause costly equipment damage. Managing data within Home Assistant is challenging, with slow responsiveness to inputs and significant lag. Despite these challenges, Home Assistant serves well as a monitoring and control mechanism within the framework.

In more complex environments with multiple sensors and outputs, Home Assistant just isnt up to the task. NodeJS is particularly well suited for automation ogic.

### Compactness and Resource Efficiency (TW together with HA Core):

The TW IoT with Home Assistant (HA) solution is highly compact and resource-efficient, especially with Home Assistant Core, which operates stably with just 500MB of RAM—unlike Home Assistant Supervised. During testing, Home Assistant Supervised consistently crashed with 1GB of RAM. The ESP Home web interface easily installs alongside HA Core, creating an efficient platform for modest IoT devices with 1GB of RAM.

A key point is the remarkable responsiveness of the HA Core API, averaging 2-5ms with no timeouts. In contrast, Home Assistant Supervised can exhibit latency exceeding 100ms, occasionally becoming completely unreachable or crashing, likely due to resource-intensive background updates. Thus, using Home Assistant Supervised for reliable, time-critical operations is strongly advised against.

### General Features
* Has very stable power and network loss recovery 
* Functions as an ESPHome subscriber
* Supports Telegram for monitoring and remote control
* Has web-based debugger for your automation
* Has a nice and easy to use logging function
* Has SystemD service creator

### Home Assistant Features
* TW IoT completely removes all need for automation logic and control in Home Assistant
* This framework is immune to network interruptions with HA
* Has full support for HA Websocket API
* System keeps track of HA latency and availability and notifies you if something is wrong
* Adds industrial level reliability to Home Assistant
* Gives Home Assistant full ability to create automations with NodeJS
* Supports multiple Home Assistant servers
* Can be used as a relay agent for Home Assistant
* Can synchronize two separate Home Assistant Servers
