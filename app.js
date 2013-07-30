//Using @OrangeDog 's version of node-uuid https://github.com/OrangeDog/node-uuid includes uuid v5 which Chromecast uses
var uuid = require('node-uuid');
var dgram = require('dgram');
var spawn = require('child_process').spawn;
var express = require('express');
var app = express();
var WebSocket = require('faye-websocket'),
    http      = require('http');

var server = http.createServer(app);

var ssdp = dgram.createSocket('udp4');

var ip_addr = '192.168.1.22';

// I'll get the other platforms later.
if (process.platform == 'darwin') {
    var chrome_path = '/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome';
    console.log('darwin');
} else {
    var chrome_path = '/usr/bin/google-chrome';
}


message = 'HTTP/1.1 200 OK\n'+
'LOCATION: http://'+ip_addr+':8008/ssdp/device-desc.xml\n'+
'CACHE-CONTROL: max-age=1800\n'+
'CONFIGID.UPNP.ORG: 7337\n'+
'BOOTID.UPNP.ORG: 7337\n'+
'USN: uuid:'+uuid.v5({ns: uuid.ns.DNS, data: "test"})+
'\nST: urn:dial-multiscreen-org:service:dial:1\n\n';

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


app.use(express.bodyParser());

app.use(function(req, res, next){
    //console.log(req.headers['user-agent']);
    console.log(req.method, req.url);
    if (req.method == 'POST') {
        console.log(req.body);
    }
    next();
});

app.get('/ssdp/device-desc.xml', function(req, res) {
    var body = '<?xml version="1.0" encoding="utf-8"?>'+
    '<root xmlns="urn:schemas-upnp-org:device-1-0" xmlns:r="urn:restful-tv-org:schemas:upnp-dd">'+
        '<specVersion>'+
        '<major>1</major>'+
        '<minor>0</minor>'+
        '</specVersion>'+
        '<URLBase>http://'+ip_addr+':8008</URLBase>'+
        '<device>'+
            '<deviceType>urn:schemas-upnp-org:device:dail:1</deviceType>'+
            '<friendlyName>test</friendlyName>'+
            '<manufacturer>Google Inc.</manufacturer>'+
            '<modelName>Eureka Dongle</modelName>'+
            '<UDN>uuid:'+uuid.v5({ns: uuid.ns.DNS, data: "test"})+'</UDN>'+
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
    res.setHeader('Access-Control-Expose-Headers', 'Application-URL');
    res.setHeader('Application-URL', 'http://'+ip_addr+':8008/apps');
    res.setHeader('Content-Type', 'application/xml');

    res.send(body);
});

app.get('/apps', function(req, res) {
    if (active_app) {
        res.redirect('/apps/'+active_app);
    }
});

var active_app = false;

var services = [];
services['c06ac0a4-95e9-4c68-83c5-75e3714ec409'] = new service('c06ac0a4-95e9-4c68-83c5-75e3714ec409', 'http://labs.geekgonecrazy.com/chromecast/receiver.html');
services['YouTube'] = new service('YouTube');
services['ChromeCast'] = new service('ChromeCast');

function service(name, url, protocols) {
    this.running = false;
    this.runningText = 'stopped';
    this.name = name;
    this.url = url;
    this.pid = false;

    this.serverSocket = false;
    this.clientSocket = false;

    this.getBody = function() {
        var body = '<?xml version="1.0" encoding="UTF-8"?>'+
        '<service xmlns="urn:dial-multiscreen-org:schemas:dial">'+
          '<name>'+this.name+'</name>'+
          '<options allowStop="true"/>'+
          '<state>'+this.runningText+'</state>';
          if (this.running) {
            body += '<link rel="run" href="web-17" />';
	    
	    body += '<servicedata xmlns="urn:chrome.google.com:cast">'+
			'<connectionSvcURL>http://'+ip_addr+':8008/connection/'+this.name+'</connectionSvcURL>'+
			'<protocols>'+
			   '<protocol>ramp</protocol>'+
			'</protocols>'+
			'<activity-status xmlns="urn:chrome.google.com:cast">'+
			'<description>YouTube TV</description>'+
				'<image src="https://s.ytimg.com/yts/favicon-vfldLzJxy.ico"/>'+
			'</activity-status>'+
		'</servicedata>';
          }

        body += '</service>';
        return body.toString();
    }

    this.start = function() {
	this.launchChrome();

        this.running = true;
        this.runningText = 'running';
        active_app = this.name;

        return this.getBody();
    }

    this.stop = function() {
        this.running = false;
        this.runningText = 'stopped';
    }

    this.launchChrome = function() {     
        var chrome = spawn(chrome_path, [' --app='+this.url]);

    }
}

app.get('/apps/:name', function(req, res) {
    res.setHeader('Access-Control-Allow-Method', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Origin', 'https://www.google.com');
    res.setHeader('Access-Control-Expose-Headers', 'Location');
    res.setHeader('Application-URL', 'http://'+ip_addr+':8008/apps');
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-control', 'no-cache, must-revalidate, no-store');
    res.send(services[req.params.name].getBody());
});

app.post('/apps/:name', function(req, res) {
    res.setHeader('Access-Control-Allow-Method', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'Location');
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Location', 'http://'+ip_addr+':8008/apps/c06ac0a4-95e9-4c68-83c5-75e3714ec409/web-17');
    res.setHeader('Access-Control-Allow-Origin', 'https://www.google.com');
    res.send(201, services[req.params.name].start());
});

app.post('/connection/:name', function(req, res) {
    res.setHeader('Access-Control-Allow-Method', 'POST,  OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'Location');
    res.setHeader('Content-Type', 'application/json');
    res.send('{"URL":"ws://'+ip_addr+':8008/session?24", "pingInterval":5}');
    
});

var session = [];

server.on('upgrade', function(request, socket, body) {
  //console.log(request, body);
  if (WebSocket.isWebSocket(request)) {
    var ws = new WebSocket(request, socket, body);

    ws.on('message', function(event) {
      console.log('--on message--');
      //console.log(event);
      var data = JSON.parse(event.data);

      //console.log(data);
      if (data.type == 'REGISTER') {
      	if (typeof services[data.name] !== 'undefined') {
		services[data.name].pingInterval = data.pingInterval;
		console.log('server connected');
		services[data.name].serverSocket = ws;
	}
      } else {
         console.log('client connected');
	 services[active_app].clientSocket = ws;
	console.log(services[active_app].serverSocket);
	if (services[active_app].serverSocket) {
		
		server = services[active_app].serverSocket;
		 //server.send(event.data);
	} else {
		setTimeout(function() {
		console.log('ran');
		 server = services[active_app].serverSocket;
		 //server.send(event.data);
		},3000);
	}

      }
      //console.log(event.target.url);

      //console.log(event);
      //ws.send(event.data);
    });

    ws.on('close', function(event) {
      console.log('close', event.code, event.reason);
      ws = null;
    });
  }
});

//server.listen(8000);


server.listen(8008, function() {
    console.log((new Date()) + ' Server is listening on port 8008');
});

