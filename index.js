var Service, Characteristic, HomebridgeAPI, FakeGatoHistoryService;
var inherits = require('util').inherits;
var os = require("os");
var hostname = os.hostname();
const fs = require('fs');
const moment = require('moment');


var intervalID;

const readFile = "/home/pi/WeatherStation/data.txt";

var sunlight;
var battery;

var alertLevel;

var glog;
var ctime;

var lastActivation, lastReset, lastChange, timesOpened, timeOpen, timeClose;

module.exports = function (homebridge) {
	
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    HomebridgeAPI = homebridge;
    FakeGatoHistoryService = require("fakegato-history")(homebridge);

    homebridge.registerAccessory("homebridge-weatherstation-sunny", "WeatherStationSunny", WeatherStationSunny);
};


function read() {
	var data = fs.readFileSync(readFile, "utf-8");
	var lastSync = Date.parse(data.substring(0, 19));
	sunlight = parseInt(data.substring(46), 10);
	battery = parseFloat(data.substring(57));
}


function WeatherStationSunny(log, config) {
    var that = this;
    this.log = glog = log;
    this.name = config.name;
    this.displayName = this.name;
    this.deviceId = config.deviceId;
    this.interval = Math.min(Math.max(config.interval, 1), 60);

    this.config = config;

    this.storedData = {};

	  alertLevel = config['alertLevel'];

    this.setUpServices();
    
    read();

	  intervalID = setInterval(function() {
		
		var stats = fs.statSync(readFile);
		
		var doit = false;
		if (ctime) {
			if (ctime.getTime() != stats.mtime.getTime()) {
				ctime = stats.mtime;
				doit = true;
			}
		}
		else {
			ctime = stats.mtime;
			doit = true;
		}
			
		if (doit) {
			read();
			glog("Sun data: ", sunlight, alertLevel, battery);

			that.fakeGatoHistoryService.addEntry({
				time: new Date().getTime() / 1000,
				status: sunlight > alertLevel ? 1 : 0
				});
		}
	}, 2000);
};


WeatherStationSunny.prototype.getFirmwareRevision = function (callback) {
    callback(null, '1.0.0');
};

WeatherStationSunny.prototype.getBatteryLevel = function (callback) {
	var perc = (battery - 0.8) * 100;
    callback(null,perc);
};

WeatherStationSunny.prototype.getStatusActive = function (callback) {
    callback(null, true);
};

WeatherStationSunny.prototype.getStatusLowBattery = function (callback) {
	if (battery >= 0.8)
        callback(null, Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
    else
        callback(null, Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW);
};

WeatherStationSunny.prototype.getStatusSun = function (callback) {	
    callback(null, sunlight > alertLevel ? 
    		 Characteristic.ContactSensorState.CONTACT_NOT_DETECTED : Characteristic.ContactSensorState.CONTACT_DETECTED);
};


WeatherStationSunny.prototype.getOpenDuration = function (callback) {
    this.sunAlertService.getCharacteristic(Characteristic.OpenDuration).updateValue(this.timeOpen, null);
    return callback(null, this.timeOpen);
};


WeatherStationSunny.prototype.getClosedDuration = function (callback) {
    this.sunAlertService.getCharacteristic(Characteristic.ClosedDuration).updateValue(this.timeClose, null);
    return callback(null, this.timeClose);
};


WeatherStationSunny.prototype.gettimesOpened = function (callback) {
    this.sunAlertService.getCharacteristic(Characteristic.TimesOpened).updateValue(this.timesOpened, null);
    return callback(null, this.timesOpened);
};


WeatherStationSunny.prototype.getLastActivation = function (callback) {
    this.sunAlertService.getCharacteristic(Characteristic.LastActivation).updateValue(this.lastActivation, null);
    return callback(null, this.lastActivation);
};


WeatherStationSunny.prototype.getReset = function (callback) {
    this.fakeGatoHistoryService.getCharacteristic(Characteristic.ResetTotal).updateValue(this.lastReset, null);
    return callback(null, this.lastReset);
};


WeatherStationSunny.prototype.setReset = function (value, callback) {
	this.timesOpened = 0;
	this.lastReset = value;
    this.fakeGatoHistoryService.setExtraPersistedData([{"lastActivation": this.lastActivation, "lastReset": this.lastReset, 
    			"lastChange": this.lastChange, "timesOpened": this.timesOpened, "timeOpen": this.timeOpen, "timeClose": this.timeClose}]);

    if (this.sunAlertService.getCharacteristic(Characteristic.TimesOpened)) {
        this.sunAlertService.getCharacteristic(Characteristic.TimesOpened).updateValue(this.timesOpened, null)
    }
    this.fakeGatoHistoryService.getCharacteristic(Characteristic.ResetTotal).updateValue(this.lastReset, null);
    return callback();
};


WeatherStationSunny.prototype.setUpServices = function () {
    // info service
    this.informationService = new Service.AccessoryInformation();

    this.informationService
        .setCharacteristic(Characteristic.Manufacturer, "THN Systems")
        .setCharacteristic(Characteristic.Model, "WeatherStationSunny")
        .setCharacteristic(Characteristic.SerialNumber, hostname + "-" + this.name)
    this.informationService.getCharacteristic(Characteristic.FirmwareRevision)
        .on('get', this.getFirmwareRevision.bind(this));
        
    this.batteryService = new Service.BatteryService(this.name);
    this.batteryService.getCharacteristic(Characteristic.BatteryLevel)
        .on('get', this.getBatteryLevel.bind(this));
    this.batteryService.setCharacteristic(Characteristic.ChargingState, Characteristic.ChargingState.NOT_CHARGEABLE);
    this.batteryService.getCharacteristic(Characteristic.StatusLowBattery)
        .on('get', this.getStatusLowBattery.bind(this));

    this.sunAlertService = new Service.ContactSensor("Sonne", "sunlight");
    this.sunAlertService.getCharacteristic(Characteristic.ContactSensorState)
        .on('get', this.getStatusSunlight.bind(this));
    this.sunAlertService.getCharacteristic(Characteristic.StatusLowBattery)
        .on('get', this.getStatusLowBattery.bind(this));
    this.sunAlertService.getCharacteristic(Characteristic.StatusActive)
        .on('get', this.getStatusActive.bind(this));

    this.fakeGatoHistoryService = new FakeGatoHistoryService("door", this, { storage: 'fs' });

    Characteristic.OpenDuration = function() {
    	 Characteristic.call(this, 'Time open', 'E863F118-079E-48FF-8F27-9C2605A29F52');
         this.setProps({
           format: Characteristic.Formats.UINT32,
           unit: Characteristic.Units.SECONDS,
           perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
         });
         this.value = this.getDefaultValue();
    };
    inherits(Characteristic.OpenDuration, Characteristic);
    Characteristic.OpenDuration.UUID = 'E863F118-079E-48FF-8F27-9C2605A29F52';  

    Characteristic.ClosedDuration = function() {
    	 Characteristic.call(this, 'Time closed', 'E863F119-079E-48FF-8F27-9C2605A29F52');
         this.setProps({
           format: Characteristic.Formats.UINT32,
           unit: Characteristic.Units.SECONDS,
           perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
         });
         this.value = this.getDefaultValue();
    };
    inherits(Characteristic.ClosedDuration, Characteristic);
    Characteristic.ClosedDuration.UUID = 'E863F119-079E-48FF-8F27-9C2605A29F52';  
    
    Characteristic.LastActivation = function() {
    	 Characteristic.call(this, 'Last Activation', 'E863F11A-079E-48FF-8F27-9C2605A29F52');
         this.setProps({
           format: Characteristic.Formats.UINT32,
           unit: Characteristic.Units.SECONDS,
           perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
         });
         this.value = this.getDefaultValue();
    };
    inherits(Characteristic.LastActivation, Characteristic);
    Characteristic.LastActivation.UUID = 'E863F11A-079E-48FF-8F27-9C2605A29F52';  

    Characteristic.TimesOpened = function() {
    	 Characteristic.call(this, 'times opened', 'E863F129-079E-48FF-8F27-9C2605A29F52');
         this.setProps({
           format: Characteristic.Formats.UINT32,
           //unit: Characteristic.Units.SECONDS,
           perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
         });
         this.value = this.getDefaultValue();
    };
    inherits(Characteristic.TimesOpened, Characteristic);
    Characteristic.TimesOpened.UUID = 'E863F129-079E-48FF-8F27-9C2605A29F52';  

    Characteristic.ResetTotal = function() {
    	 Characteristic.call(this, 'times opened', 'E863F112-079E-48FF-8F27-9C2605A29F52');
         this.setProps({
           format: Characteristic.Formats.UINT32,
           //unit: Characteristic.Units.SECONDS,
           perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
         });
         this.value = this.getDefaultValue();
    };
    inherits(Characteristic.ResetTotal, Characteristic);
    Characteristic.ResetTotal.UUID = 'E863F112-079E-48FF-8F27-9C2605A29F52';  
    
    this.sunAlertService.addCharacteristic(Characteristic.LastActivation)
        .on('get', this.getLastActivation.bind(this));
    this.sunAlertService.addCharacteristic(Characteristic.TimesOpened)
        .on('get', this.gettimesOpened.bind(this));
    this.sunAlertService.addCharacteristic(Characteristic.OpenDuration)
        .on('get', this.getOpenDuration.bind(this));
    this.sunAlertService.addCharacteristic(Characteristic.ClosedDuration)
        .on('get', this.getClosedDuration.bind(this));
    this.sunAlertService.addCharacteristic(Characteristic.ResetTotal)
        .on('get', this.getReset.bind(this))
        .on('set', this.setReset.bind(this));
        
    if (this.fakeGatoHistoryService.getExtraPersistedData() == undefined) {
    	this.lastActivation = 0;
    	this.lastReset = moment().unix() - moment('2001-01-01T00:00:00Z').unix();
    	this.lastChange = moment().unix();
    	this.timeOpened = 0;
    	this.timeOpen = 0;
    	this.timeClose = 0;
           
        this.fakeGatoHistoryService.setExtraPersistedData([{"lastActivation": this.lastActivation, "lastReset": this.lastReset, 
        				"lastChange": this.lastChange, "timesOpened": this.timesOpened, "timeOpen": this.timeOpen, "timeClose": this.timeClose}]);

        } else {
            this.lastActivation = this.fakeGatoHistoryService.getExtraPersistedData()[0].lastActivation;
            this.lastReset = this.fakeGatoHistoryService.getExtraPersistedData()[0].lastReset;
            this.lastChange = this.fakeGatoHistoryService.getExtraPersistedData()[0].lastChange;
            this.timesOpened = this.fakeGatoHistoryService.getExtraPersistedData()[0].timesOpened;
            this.timeOpen = this.fakeGatoHistoryService.getExtraPersistedData()[0].timeOpen;
            this.timeClose = this.fakeGatoHistoryService.getExtraPersistedData()[0].timeClose;
        }
        
    var CustomCharacteristic = {};
    
};


WeatherStationSunny.prototype.getServices = function () {
    var services = [this.informationService, this.batteryService, this.fakeGatoHistoryService, this.sunAlertService];

    return services;
};
