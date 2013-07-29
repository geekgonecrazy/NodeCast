var uuid = require('node-uuid');
var dgram = require('dgram');

var ssdp = dgram.createSocket('udp4');

message = 'HTTP/1.1 200 OK\n'+
'LOCATION: http://192.168.1.22:8008/ssdp/device-desc.xml\n'+
'CACHE-CONTROL: max-age=1800\n'+
'CONFIGID.UPNP.ORG: 7337\n'+
'BOOTID.UPNP.ORG: 7337\n'+
'USN: uuid:'+uuid.v5({ns: uuid.ns.DNS, data: "testies"})+
'\nST: urn:dial-multiscreen-org:service:dial:1\n\n';
console.log(message);
ssdp.on('listening', function () {
	console.log('SSDP started');
});

ssdp.on('message', function (msg, rinfo) {
	var decodedMsg = msg.toString('utf8');

	if (decodedMsg.indexOf('M-SEARCH') > -1 && decodedMsg.indexOf('urn:dial-multiscreen-org:service:dial:1') > -1) {
		ssdp.send(new Buffer(message), 0, message.length, rinfo.port, rinfo.address, function(err, bytes){
			if (!err) {
				console.log('SSDP response to: '+rinfo.address);
			}
		});
	}

});

ssdp.bind(1900, function(){
	ssdp.addMembership('239.255.255.250');
});

var express = require('express');
var app = express();

app.use(function(req, res, next){
    //console.log(req.headers['user-agent']);
    console.log(req.method, req.url);
    next();
});

app.get('/ssdp/device-desc.xml', function(req, res) {
	var body = '<?xml version="1.0" encoding="utf-8"?>'+
    '<root xmlns="urn:schemas-upnp-org:device-1-0" xmlns:r="urn:restful-tv-org:schemas:upnp-dd">'+
        '<specVersion>'+
        '<major>1</major>'+
        '<minor>0</minor>'+
        '</specVersion>'+
        '<URLBase>http://192.168.1.22:8008</URLBase>'+
        '<device>'+
            '<deviceType>urn:schemas-upnp-org:device:dail:1</deviceType>'+
            '<friendlyName>testies</friendlyName>'+
            '<manufacturer>Google Inc.</manufacturer>'+
            '<modelName>Eureka Dongle</modelName>'+
            '<UDN>uuid:'+uuid.v5({ns: uuid.ns.DNS, data: "testies"})+'</UDN>'+
            '<serviceList>'+
                '<service>'+
                   '<serviceType>urn:schemas-upnp-org:service:dail:1</serviceType>'+
                    '<serviceId>urn:upnp-org:serviceId:dail</serviceId>'+
                    '<controlURL>/ssdp/notfound</controlURL>'+
                    '<eventSubURL>/ssdp/notfound</eventSubURL>'+
                    '<SCPDURL>/ssdp/notfound</SCPDURL>'+
                '</service>'+
            '</serviceList>'+
        '</device>'+
    '</root>';

    res.setHeader('Access-Control-Allow-Method', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'Location');
    res.setHeader('Application-URL', 'http://192.168.1.22:8008/apps');
    res.setHeader('Content-Type', 'application/xml');

    res.send(body);
});

service('c06ac0a4-95e9-4c68-83c5-75e3714ec409');
service('YouTube');

function service(name, url, protocols) {
	var body = '<?xml version="1.0" encoding="UTF-8"?>'+
	'<service xmlns="urn:dial-multiscreen-org:schemas:dial">'+
	  '<name>'+name+'</name>'+
	  '<options allowStop="true"/>'+
	  '<state>stopped</state>'+
	'</service>';

	app.get('/apps/'+name, function(req, res) {
		res.setHeader('Access-Control-Allow-Method', 'GET, POST, DELETE, OPTIONS');
	    res.setHeader('Access-Control-Expose-Headers', 'Location');
	    res.setHeader('Application-URL', 'http://192.168.1.22:8008/apps');
	    res.setHeader('Content-Type', 'application/xml');
	    res.setHeader('Cache-control', 'no-cache, must-revalidate, no-store');
	    res.send(body);
	});
	

}

app.listen(8008);
console.log('Listening on port 8008');

