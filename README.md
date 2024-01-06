*If you have a question, please just open a dialog in the “issue” section so others can benefit from the discussion.*

*This project is interested in collaborating with the integration of the Zigbee2mqtt NodeJS API* https://www.npmjs.com/package/zigbee2mqtt 

### Preamble:
If you need neither Home Assistant, Telegram nor ESPHome then this framework still offers UDP communications,  debugging website, timer functions, logging, notification, service installer and easy volatile and non-volatile memory storage. 

### General Concept of ThingWerks:
This is an ultra lightweight IoT Automation Framework for NodeJS. It's purpose is to get you up and running with a basic automation platform quickly. It is intended for use with industrial as well as home automation projects. 

Ready made industrial TW-Client automations will be included here in this repo.

### Design Principals:
TW-Core maintains all of the communication, management and system functions. The TW-Client contains just the bare minimum code to communicate with the Core and is the intended location to put your automation(s) code. It has been designed this way to increase reliability, simplicity and streamline the deployment of future enhancements. 

### Relationship with Home Assistant:
Home Assistant is not required but is fully supported. HA is intended to be used as monitoring and remote control agent for ThingWerks because of its smart-phone app and powerful GUI. It can also function as a Zigbee Gateway because ZHA and Zigbee2MQTT are not yet directly supported in TW. 

This framework can leverage HA's powerful GUI, Smartphone app and monitoring capabilities for you own NodeJS automations. To use NodeJS for the heavy lifting, data manipulation and communication. This is a lot more reliable, flexable and responsive than using Home Assistant for such complex tasks. Id also argue that its a lot simpler to code a basic logic in JS than it is using the GUI or YAML provided foundation is there.

Home Assistant isn't suitable for industrial applications or where malfunctions can lead to costly equipment damage. Furthermore, data manipulation and management is very cumbersome and difficult if its even possible at all. The state management for certain conditions like startup, power loss, errors and other likely conditions is difficult to understand and control in HA, its also very slow to react to inputs and has huge lag. Withstanding, HA has a very nice GUI and it works very well as a monitoring and control mechanism in the scheme of this framework.

Though Home Assistant may be reliable for some situations, using it for complex environments with multiple flow meters, pressure sensors, large motors and a multitude of inputs and outputs of that sort; it is simply not up to the task but NodeJS can do this easily.


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
* Gives Home Assistant full support of automation with NodeJS
* Can be used as a relay agent for Home Assistant
* Can synchronize two separate Home Assistants
