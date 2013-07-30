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

var argv = process.argv;

var device_info = {
    chrome_path : '',
    ip_addr : '',
    device_name : '',
    uuid : '',

    configure : function() {
        if (typeof argv[2] !== 'undefined') {
            this.ip_addr = argv[2];
        } else {
            console.log('Specify and ip address to listen on.')
            process.exit();
        }

        // Decide on the path to use based on platform
        if (process.platform == 'linux') {
            this.chrome_path = '/usr/bin/google-chrome';
        } else if (process.platform == 'darwin') {   
            this.chrome_path = '/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome';
        } else if (process.platform.match(/^win/)){
            this.chrome_path = '';
        }

        if (typeof argv[3] !== 'undefined') {
            this.device_name = argv[3];
        } else {
            this.device_name = 'NodeCast';
        }

        this.uuid = uuid.v5({ns: uuid.ns.DNS, data: this.device_name});

    },

    ssdp_device_info : function() {
        var body = '<?xml version="1.0" encoding="utf-8"?>'+
        '<root xmlns="urn:schemas-upnp-org:device-1-0" xmlns:r="urn:restful-tv-org:schemas:upnp-dd">'+
            '<specVersion>'+
            '<major>1</major>'+
            '<minor>0</minor>'+
            '</specVersion>'+
            '<URLBase>http://'+this.ip_addr+':8008</URLBase>'+
            '<device>'+
                '<deviceType>urn:schemas-upnp-org:device:dail:1</deviceType>'+
                '<friendlyName>'+this.device_name+'</friendlyName>'+
                '<manufacturer>Google Inc.</manufacturer>'+
                '<modelName>Eureka Dongle</modelName>'+
                '<UDN>uuid:'+this.uuid+'</UDN>'+
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

        return body;
    }
}

device_info.configure();



var DIAL = {
    response_msg : function() {
        var message = 'HTTP/1.1 200 OK\n'+
        'LOCATION: http://'+device_info.ip_addr+':8008/ssdp/device-desc.xml\n'+
        'CACHE-CONTROL: max-age=1800\n'+
        'CONFIGID.UPNP.ORG: 7337\n'+
        'BOOTID.UPNP.ORG: 7337\n'+
        'USN: uuid:'+device_info.uuid+
        '\nST: urn:dial-multiscreen-org:service:dial:1\n\n';

        return message;
    },

    init : function() {
        console.log('Initializing DIAL.')
        
        ssdp.on('listening', function () {
            console.log('DIAL started');
        });

        ssdp.on('message', function (msg, rinfo) {
            var decodedMsg = msg.toString('utf8');

            if (decodedMsg.indexOf('M-SEARCH') > -1 && decodedMsg.indexOf('urn:dial-multiscreen-org:service:dial:1') > -1) {
                ssdp.send(new Buffer(DIAL.response_msg()), 0, DIAL.response_msg().length, rinfo.port, rinfo.address, function(err, bytes){
                    if (!err) {
                        console.log('DIAL response to: '+rinfo.address);
                    }
                });
            }

        });

        ssdp.bind(1900, function(){
            ssdp.addMembership('239.255.255.250');
        });
    }
}

DIAL.init();

service = function(name, url, protocols) {
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
                '<connectionSvcURL>http://'+device_info.ip_addr+':8008/connection/'+this.name+'</connectionSvcURL>'+
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
        NodeCast.active_app = this.name;

        return this.getBody();
    }

    this.stop = function() {
        this.running = false;
        this.runningText = 'stopped';
    }

    this.launchChrome = function() {     
        var chrome = spawn(device_info.chrome_path, [' --app='+this.url]);

    }
}

var NodeCast = {
    init : function() {
        this.services['c06ac0a4-95e9-4c68-83c5-75e3714ec409'] = new service('c06ac0a4-95e9-4c68-83c5-75e3714ec409', 'http://labs.geekgonecrazy.com/chromecast/receiver.html');
        this.services['YouTube'] = new service('YouTube');
        this.services['ChromeCast'] = new service('ChromeCast');
    },

    active_app : false,

    services : [],

    ssdp : {
        device_desc : function(req, res) {
            res.setHeader('Access-Control-Allow-Method', 'GET, POST, DELETE, OPTIONS');
            res.setHeader('Access-Control-Expose-Headers', 'Application-URL');
            res.setHeader('Application-URL', 'http://'+device_info.ip_addr+':8008/apps');
            res.setHeader('Content-Type', 'application/xml');

            res.send(device_info.ssdp_device_info());
        }
    },

    apps : {
        base : function(req, res) {
            if (active_app) {
                res.redirect('/apps/'+active_app);
            }
        },

        get : function(req, res) {
            res.setHeader('Access-Control-Allow-Method', 'GET, POST, DELETE, OPTIONS');
            res.setHeader('Origin', 'https://www.google.com');
            res.setHeader('Access-Control-Expose-Headers', 'Location');
            res.setHeader('Application-URL', 'http://'+device_info.ip_addr+':8008/apps');
            res.setHeader('Content-Type', 'application/xml');
            res.setHeader('Cache-control', 'no-cache, must-revalidate, no-store');
            res.send(NodeCast.services[req.params.name].getBody());
        },

        post : function(req, res) {
            res.setHeader('Access-Control-Allow-Method', 'GET, POST, DELETE, OPTIONS');
            res.setHeader('Access-Control-Expose-Headers', 'Location');
            res.setHeader('Content-Type', 'application/xml');
            res.setHeader('Location', 'http://'+device_info.ip_addr+':8008/apps/c06ac0a4-95e9-4c68-83c5-75e3714ec409/web-17');
            res.setHeader('Access-Control-Allow-Origin', 'https://www.google.com');
            console.log(NodeCast.services);
            res.send(201, NodeCast.services[req.params.name].start());
        }
    },

    connection : {
        base : function(req, res) {
            res.setHeader('Access-Control-Allow-Method', 'POST,  OPTIONS');
            res.setHeader('Access-Control-Expose-Headers', 'Location');
            res.setHeader('Content-Type', 'application/json');
            res.send('{"URL":"ws://'+device_info.ip_addr+':8008/session?24", "pingInterval":5}');
        }
    }

}

NodeCast.init();

app.use(express.bodyParser());

app.use(function(req, res, next){
    //console.log(req.headers['user-agent']);
    console.log(req.method, req.url);
    if (req.method == 'POST') {
        console.log(req.body);
    }
    next();
});

app.get('/ssdp/device-desc.xml', NodeCast.ssdp.device_desc);

app.get('/apps', NodeCast.apps.base);

app.get('/apps/:name', NodeCast.apps.get);

app.post('/apps/:name', NodeCast.apps.post);

app.post('/connection/:name', NodeCast.connection.base);

var session = [];
ws_server = null;

server.on('upgrade', function(request, socket, body) {
  //console.log(request, body);
  var headers = request.headers;
  if (WebSocket.isWebSocket(request) && headers.connection.toLowerCase() == 'upgrade' && headers.upgrade.toLowerCase() == 'websocket') {
    console.log('Valid Websocket upgrade');
    
    var url = request.url.substring(1);
    console.log(url);

    if (url == 'connection') {
        console.log('Browser here');
        ws_server = new WebSocket(request, socket, body, {ping: 5});
        ws_server.on('message', function(event) {
            var data = JSON.parse(event.data);

            //console.log(data);
            if (data.type == 'REGISTER') {
                if (typeof NodeCast.services[data.name] !== 'undefined') {
                    //services[data.name].pingInterval = data.pingInterval;
                    //console.log('server connected');
                    //services[data.name].serverSocket = ws;
                    
                }
            } else {
                
                console.log(event.data);
            }
        });
    }

    if (url.indexOf('session') > -1) {
        console.log('Client here');
        var ws = new WebSocket(request, socket, body);
        ws.on('message', function(event) {
            console.log(event.data);
            if (ws_server !== null) {
                ws_server.send(event.data);
            } else {
                wait = setInterval(function() {
                    if (ws_server !== null) {
                        ws_server.send(event.data);
                        clearInterval(wait);
                        console.log('success');
                    }
                },100);
            }
            
        });
        
    }
    
  } else {
    console.log('Invalid Upgrade');
  }

});


server.listen(8008, function() {
    console.log((new Date()) + ' Server is listening on port 8008');
});

