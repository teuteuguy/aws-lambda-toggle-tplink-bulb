/*
    Make sure you provide as environment variables the following:
    - token: If you don't already have a token, you can run the getToken function with your TPLink Kasa user and password
    - uuid: The UUID of this lambda function. Get a random one from here: https://www.uuidgenerator.net/version4
*/

'use strict';
console.log('Loading Lambda function');
console.log('TOKEN:', process.env.token);
console.log('UUID:', process.env.uuid);

const http = require('https');

const GLOBAL_TPLINK_URL = 'wap.tplinkcloud.com';

function httpPostPromise(url, jsonData, token) {

    return new Promise((resolve, reject) => {

        // console.log('httpPostPromise:', url);
        // console.log('httpPostPromise.jsonData:', JSON.stringify(jsonData));
        // console.log('httpPostPromise.token:', token);

        let path = '';
        if (token) path = '/?token=' + token;
        let post_options = {
            host: url,
            port: '443',
            path: path,
            method: 'POST',
            headers: {
                'Accept': '*/*',
                'Content-Type': 'application/json'
            }
        };
        let post_req = http.request(post_options, function(res) {
            res.setEncoding('utf8');
            let rawData = '';
            res.on('data', (chunk) => { rawData += chunk; });
            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(rawData);
                    // console.log(parsedData);
                    resolve(parsedData);
                } catch (error) {
                    // console.error(error.message);
                    reject(error);
                }
            });
        }).on('error', (error) => {
            console.error('httpPostPromise:', 'Got error in httpPost', JSON.stringify(e, null, 2));
            reject(error);
        });

        // post the data
        post_req.write(JSON.stringify(jsonData));
        post_req.end();

    });

}

// Helper functions
function CMD_GETTOKEN(user, passwd) { return { method: 'login', params: { appType: 'TPLink Lambda Function', cloudUserName: user, cloudPassword: passwd, terminalUUID: UUID } } };

function CMD_GETDEVICES() { return { method: 'getDeviceList' }; }

function CMD_PASSTHROUGH(deviceId, requestDataJSON) { return { method: 'passthrough', params: { deviceId: deviceId, requestData: JSON.stringify(requestDataJSON) } }; }

function CMD_GETSYSINFO(deviceId) { return CMD_PASSTHROUGH(deviceId, { system: { get_sysinfo: {} } }); }

function CMD_SET_BULB(deviceId, on_off) { return CMD_PASSTHROUGH(deviceId, { 'smartlife.iot.smartbulb.lightingservice': { 'transition_light_state': { 'on_off': on_off } } }); }

function CMD_BULB_ON(deviceId) { return CMD_PASSTHROUGH(deviceId, { 'smartlife.iot.smartbulb.lightingservice': { 'transition_light_state': { 'on_off': 1 } } }); }

function CMD_BULB_OFF(deviceId) { return CMD_PASSTHROUGH(deviceId, { 'smartlife.iot.smartbulb.lightingservice': { 'transition_light_state': { 'on_off': 0 } } }); }

// Functions
function getTokenPromise(user, passwd) {
    return httpPostPromise(GLOBAL_TPLINK_URL, CMD_GETTOKEN(user, passwd)).then((response) => {
        return response.result.token;
    });
}

// getToken('email', 'password', (error, response) => {
//     if (error) console.error(error);
//     else {
//         console.log(response);
//     }
// });

function getDevicesPromise() {
    return httpPostPromise(GLOBAL_TPLINK_URL, CMD_GETDEVICES(), process.env.token).then((response) => {
        return response.result.deviceList;
    });
}

// getDevices((error, response) => {
//     if (error) console.error(error);
//     else {
//         console.log(response);
//     }
// });

function getSysInfoPromise(deviceUrl, deviceId) {
    return httpPostPromise(deviceUrl, CMD_GETSYSINFO(deviceId), process.env.token).then((response) => {
        return JSON.parse(response.result.responseData).system.get_sysinfo;
    });

    // "smartlife.iot.smartbulb.lightingservice": {
    //   "transition_light_state": { "on_off": on_off, "brightness": brightness } }
    // {"method":"passthrough", "params": {"deviceId": "Y", "requestData": "{\"smartlife.iot.smartbulb.lightingservice\":{\"transition_light_state\":{\"on_off\":1,\"brightness\":100} } } " } }
}

// getSysInfo(process.env.bulbUrl, process.env.bulbDeviceId, (error, response) => {
//     if (error) console.error(error);
//     else {
//         console.log(response);
//     }
// });

function setBulbOnOffPromise(deviceUrl, deviceId, on_off) {
    return httpPostPromise(deviceUrl, CMD_SET_BULB(deviceId, on_off), process.env.token).then((response) => {
        return JSON.parse(response.result.responseData);
    });
}

function toggleBulbPromise(deviceUrl, deviceId) {

    console.log('toggleBulbPromise: Toggling device', deviceId, 'on', deviceUrl);

    return getSysInfoPromise(deviceUrl, deviceId).then((response) => {
        // console.log(response);
        // Light state is on: .light_state.on_off
        let newState = 1 - response.light_state.on_off;
        return setBulbOnOffPromise(deviceUrl, deviceId, newState);
    });
}

function handler(event, context, callback) {

    console.log('handler: Lambda Received event:', JSON.stringify(event, null, 2));

    if (event.devices === undefined) {
        let error = {
            message: 'ERROR: event needs to have a Device array of url and deviceId'
        };
        console.error(error.message);
        callback(error);
    } else {

        console.log('handler: Toggling', event.devices.length, 'devices');

        let promises = [];

        event.devices.forEach((device) => {
            promises.push(toggleBulbPromise(device.url, device.deviceId));
        });

        Promise.all(promises).then((responses) => {
            callback(null, responses);
        }).catch((error) => {
            console.error(error);
            callback(error);
        });

    }

}

exports.handler = handler;
