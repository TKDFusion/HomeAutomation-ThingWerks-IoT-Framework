## If using Home Assistant or ESPHome:
1) Install Home Asistant (Core) and or ESP Home
   * https://github.com/thwerks/ThingWerks-IoT-Frmework/blob/main/Readme-install-ha-esphome.md
3) Generate API Token if you're using Home Assistant 
   * https://community.home-assistant.io/t/how-to-get-long-lived-access-token/162159
  
## Prepare Files & Environment
1) Create /apps/tw Application directory and change to this directory
   * the tw-core has some dependencies to using the /apps/tw directory
2) Install NodeJS (preferably v20) and necessary NPM packages
   * npm install express
   * npm install websocket
3) If Home Assistant, ESP or Telegram are enabled:
   * npm install @2colors/esphome-native-api
   * npm install node-telegram-bot-api
   * npm install homeassistant
4) Download tw-core.js, tw-client-example.js and config example and place into your app directory

## Setup ESPHome Devices, Home Assistant and build your automation
1) Program all your ESP devices using ESPHome manager
    * if connected via USB `docker run --device=/dev/ttyUSB0 --rm --net=host -v "${PWD}":/config -it ghcr.io/esphome/esphome`
    * if already connected w via wifi `docker run --device=/dev/ttyUSB0 --rm --net=host -v "${PWD}":/config -it ghcr.io/esphome/esphome`
    * `http://172.0.0.1:6052`
    * add ESP devices to the TW Core `config.json`,
    * download `config.json` example and put in `/app/tw/config.json`
        - Configure Home Assistant Parameters:
        - one object {} for each HA server containing: enable, address, port etc.
        - Configure ESP devices
        - One object per device containing IP Address and Security Key
    * as an alternative, ESPHome devices can be added to HomeAssistant and can referenced in the tw-client rather than using ESPHome system in TW Core/config
2) Setup HA
    * create Toggle Helpers to control your TW Client automations and other control you want to access ffrom the clients.
    * copy and paste the entity names from the Home Assistant entity list into client configs as shown in the client example 
    * create your control panel in HA and reference sensors from tw-clients. fine them in the HA Entities list.

## Build Your Automation
1) Review the client-example.js for complete programming guide
2) Test run Core and Clients in the terminal using `node` or `nodemon` and use log to determine proper operation. Start TW-Core first, then run the Clients
3) Debugging:
    * use firefox to view the URL for pretty JSON formatting
    * client memory `http://127.0.0.1:20000/client` 
    * core states `http://127.0.0.1:20000/state`
    * esp devices `http://127.0.0.1:20000/esp`
    * ha helpers `http://127.0.0.1:20000/ha`

## Install the Core and Clients
1) Install the core using  
    * `node core.js -i`  (or -u to uninstall)
       - `-i -j` to use journel logging rather than monitor log file 
    * monitor log file `tail -f /apps/log-tw-core.txt -n 500`
2) Install the cleints
    * `node client-clientName.js -i`  (or -u to uninstall)
    * file name becomes the service name prepended by `tw`
    * monitor using sudo `journalctl -efu tw-client-name`
