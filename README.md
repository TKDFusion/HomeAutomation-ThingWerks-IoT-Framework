## ThingWerks IoT Framework

*If you have a question, please just open a dialog in the “issue” section so others can benefit from the discussion.*

## What is ThingWerks?

#### General Concept
This is an ultra lightweight IoT Automation Framework for NodeJS. It's purpose is to get you up and running with a basic automation platform quickely but not have anuthing more than the basics. This is intended for use with industrial as well as homee automation projects. 

#### Design Principals
TW-Core houses all of the communication, management and system functions. The TW-client contains just the bare minimum code to communicate with the Core and is the intended location to put your automation(s) code. It has been designed this way to increase reliability, simplicity and streamline the deplyment of future enhancements. 

#### Relationship with Home Assistant
Home Assistant is not required but is fully supported. HA is intended to be used as monitoring and remote control agent for ThingWerks and can function as a Zigbee Gateway. ZHA and Zigbee2MQTT are not yet directly supported but work work perfectly well behind Home Assistant Core
