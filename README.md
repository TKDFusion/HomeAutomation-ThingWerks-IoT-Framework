*If you have a question, please just open a dialog in the “issue” section so others can benefit from the discussion.*

*This project is intered in collaberating with the integration of ZHA, Zigbee2MQTT and MQTT*

### General Concept of ThingWerks
This is an ultra lightweight IoT Automation Framework for NodeJS. It's purpose is to get you up and running with a basic automation platform quickely. It is intended for use with industrial as well as homee automation projects. 

Ready made industrial TW-Client automations will be included here in this repo.

### Design Principals
TW-Core maintains all of the communication, management and system functions. The TW-Client contains just the bare minimum code to communicate with the Core and is the intended location to put your automation(s) code. It has been designed this way to increase reliability, simplicity and streamline the deplyment of future enhancements. 

### Relationship with Home Assistant

Home Assistant is not required but is fully supported. HA is intended to be used as monitoring and remote control agent for ThingWerks because of its smartphone app and powerful GUI. It can aloo function as a Zigbee Gateway because ZHA and Zigbee2MQTT are not yet directly supported in TW. 

Home Assistant does not provide an acceptable level of reliability for use in industrial use and has issues in general. That being said, Home Assistan Core version is very reliable as a gateway for Zigbee and a monitoring or smartphone control agent since these usaes cant compramise the Thing Werks Core.

### General Features
* Has very stable power and network loss recovery 
* Functions as an ESPHome subscriber
* Supports Telegram for monitoring and remote control
* Has web-bassed debugger for your automation
* Has a nice and easy to use logging function
* Has systemD service creator

### Home Assistant Features
* TW IoT completely removes all need for automation logic and control in Home Assistant
* This framework is immune to network interruptions with HA
* Has full support for HA Websocket API
* System keeps track of HA latency and availability and notifies you if something is wrong
* Adds industrial level reliability to Home Assistant
* Gives Home Assistant full support of automation with NodeJS
* Can be used as a relay agent for Home Assistant
* Can syncronize two seperate Home Assistants
