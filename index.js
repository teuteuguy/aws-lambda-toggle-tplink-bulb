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
            console.error('httpPostPromise:', 'Got error in httpPost', JSON.stringify(error, null, 2));
            reject(error);
        });

        // post the data
        post_req.write(JSON.stringify(jsonData));
        post_req.end();

    });

}

class LB100 {

    // Helper functions
    static CMD_GETTOKEN(user, passwd) { return { method: 'login', params: { appType: 'TPLink Lambda Function', cloudUserName: user, cloudPassword: passwd, terminalUUID: process.env.uuid } } };
    static CMD_GETDEVICES() { return { method: 'getDeviceList' }; }
    static CMD_PASSTHROUGH(deviceId, requestDataJSON) { return { method: 'passthrough', params: { deviceId: deviceId, requestData: JSON.stringify(requestDataJSON) } }; }
    static CMD_GETSYSINFO(deviceId) { return LB100.CMD_PASSTHROUGH(deviceId, { system: { get_sysinfo: {} } }); }
    static CMD_SET_BULB(deviceId, on_off) { return LB100.CMD_PASSTHROUGH(deviceId, { 'smartlife.iot.smartbulb.lightingservice': { 'transition_light_state': { 'on_off': on_off } } }); }
    static CMD_SET_BULB_WITH_BRIGHTNESS(deviceId, on_off, brightness) { return LB100.CMD_PASSTHROUGH(deviceId, { 'smartlife.iot.smartbulb.lightingservice': { 'transition_light_state': { 'ignore_default': 1, 'on_off': on_off, 'brightness': brightness } } }); }
    // static CMD_BULB_ON(deviceId) { return LB100.CMD_PASSTHROUGH(deviceId, { 'smartlife.iot.smartbulb.lightingservice': { 'transition_light_state': { 'on_off': 1 } } }); }
    // static CMD_BULB_OFF(deviceId) { return LB100.CMD_PASSTHROUGH(deviceId, { 'smartlife.iot.smartbulb.lightingservice': { 'transition_light_state': { 'on_off': 0 } } }); }

    getTokenPromise(user, passwd) {
        return httpPostPromise(GLOBAL_TPLINK_URL, LB100.CMD_GETTOKEN(user, passwd)).then((response) => {
            if (response.error_code) {
                throw Error('Error in getTokenPromise: ' + JSON.stringify(response));
            }
            return response.result;
        });
    }

    getDevicesPromise() {
        return httpPostPromise(GLOBAL_TPLINK_URL, LB100.CMD_GETDEVICES(), process.env.token).then((response) => {
            return response.result.deviceList;
        });
    }

    getSysInfoPromise(deviceUrl, deviceId) {
        return httpPostPromise(deviceUrl, LB100.CMD_GETSYSINFO(deviceId), process.env.token).then((response) => {
            if (response.error_code) {
                throw Error('Error in getSysInfoPromise: ' + JSON.stringify(response));
            }
            return JSON.parse(response.result.responseData).system.get_sysinfo;
        });

        // "smartlife.iot.smartbulb.lightingservice": {
        //   "transition_light_state": { "on_off": on_off, "brightness": brightness } }
        // {"method":"passthrough", "params": {"deviceId": "Y", "requestData": "{\"smartlife.iot.smartbulb.lightingservice\":{\"transition_light_state\":{\"on_off\":1,\"brightness\":100} } } " } }
    }

    setBulbOnOffPromise(deviceUrl, deviceId, on_off, brightness) {
        if (brightness !== undefined) return httpPostPromise(deviceUrl, LB100.CMD_SET_BULB_WITH_BRIGHTNESS(deviceId, on_off, brightness), process.env.token).then((response) => {
            return JSON.parse(response.result.responseData);
        });
        else return httpPostPromise(deviceUrl, LB100.CMD_SET_BULB(deviceId, on_off), process.env.token).then((response) => {
            return JSON.parse(response.result.responseData);
        });
    }

    toggleBulbPromise(deviceUrl, deviceId, preset) {

        console.log('toggleBulbPromise: Toggling device', deviceId, 'on', deviceUrl, 'with preset', preset);

        return this.getSysInfoPromise(deviceUrl, deviceId).then((response) => {
            // console.log(response);
            // Light state is on: .light_state.on_off
            let newState = 1 - response.light_state.on_off;
            let newBrightness;
            if (preset !== undefined) {
                newBrightness = response.preferred_state.find((state) => {
                    return state.index == preset;
                }).brightness;
                console.log('Calculating new brightness:', newBrightness, 'for preset', preset);
            }
            return this.setBulbOnOffPromise(deviceUrl, deviceId, newState, newBrightness);
        });
    }

}


function handler(event, context, callback) {

    let lb100 = new LB100();

    // Configure Test EVENT to have clickType = "TOKEN" to trigger getting a new token from TP Link
    // clickType = TOKEN
    // user = user
    // password = password
    if (event.clickType === 'TOKEN') {
        console.log('Getting a new token.');
        lb100.getTokenPromise(event.user, event.password).then((token) => {
            callback(null, token);
        }).catch((error) => {
            callback(error);
        });
        
    } else {

        if (event.clickType === 'DOUBLE') event.preset = 0;
        else if (event.clickType === 'LONG') event.preset = 1;
    
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
                promises.push(lb100.toggleBulbPromise(device.url, device.deviceId, event.preset));
            });
    
            Promise.all(promises).then((responses) => {
                callback(null, responses);
            }).catch((error) => {
                console.error(error);
                callback(error);
            });
    
        }
    }
}

exports.handler = handler;
exports.LB100 = LB100;