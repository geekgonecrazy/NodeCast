/*
    NodeCast - A node based ChromeCast emulator
    Author: Aaron Ogle

*/

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

    this.protocols = [];

    this.sessions = [];

    this.connection = false;

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
        if (!this.running) {
            this.launchChrome();
            this.running = true;
            this.runningText = 'running';
            NodeCast.active_app = this.name;
        }
        
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
            res.send(201, NodeCast.services[req.params.name].start());
        }
    },

    connection : {
        base : function(req, res) {
            res.setHeader('Access-Control-Allow-Method', 'POST,  OPTIONS');
            res.setHeader('Access-Control-Expose-Headers', 'Location');
            res.setHeader('Content-Type', 'application/json');
            session_count++;
            res.send('{"URL":"ws://'+device_info.ip_addr+':8008/session?'+session_count+'", "pingInterval":5}');
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

function session(session_id) {
    this.server = false;
    this.client = false;
    this.ServerQueue = [];
    this.ClientQueue = [];
    this.session_id = session_id;

    this.addServer = function(socket) {
        console.log('Session['+this.session_id+'] Server Added.');
        this.server = socket;
        if (this.ServerQueue.length > 0) {
            for (i in this.ServerQueue) {
                console.log('Session['+this.session_id+'] Checking protocols..');
    
                if (NodeCast.services[NodeCast.active_app].protocols.indexOf(this.ServerQueue[i][0]) > -1) {
                    this.server.send(this.ServerQueue[i]);
                    console.log('Session['+this.session_id+'] Delivered Queued Message To Server.');
                }

                delete this.ServerQueue[i];
            }
        }
    }

    this.addClient = function(socket) {
        console.log('Session['+this.session_id+'] Client Added.');
        this.client = socket;
        if (this.ClientQueue.length > 0) {
            for (i in this.ClientQueue) {
                console.log('Session['+this.session_id+'] Checking protocols..');

                if (NodeCast.services[NodeCast.active_app].protocols.indexOf(this.ClientQueue[i][0]) > -1) {
                    this.server.send(this.ClientQueue[i]);
                    console.log('Session['+this.session_id+'] Delivered Queued Message To Server.');
                }
                delete this.ClientQueue[i];
            }
        }
    }

    this.getServer = function() {
        return this.server;
    }

    this.getClient = function() {
        return this.client;
    }

    this.sendToClient = function(data) {
        console.log('Session['+this.session_id+'] Sending Message to Client.');
        if (this.client) {
            this.client.send(data);
        } else {
            console.log('Session['+this.session_id+'] Client not available.  Queueing');
            this.ClientQueue.push(data);
        }
    }

    this.sendToServer = function(data) {
        console.log('Session['+this.session_id+'] Sending Message to Server.');
        if (this.server) {
            if (NodeCast.services[NodeCast.active_app].protocols.indexOf(data[0]) > -1) {
                this.server.send(data);
            }
        } else {
            console.log('Session['+this.session_id+'] Server not available.  Queueing');
            this.ServerQueue.push(data);
        }
    }

    this.connectClientToServer = function() {
        var session_id = this.session_id;
        // If Chrome is up make it aware of the client.
        console.log('Session['+session_id+'] Connecting Client To Server...');
        if (NodeCast.services[NodeCast.active_app].connection) {
            if (!this.server) {
                console.log('Session['+session_id+'] Connection open sending channel request.');
                NodeCast.services[NodeCast.active_app].connection.send('{"channel":0, "requestId":'+session_id+', "type": "CHANNELREQUEST"}');
            }
            
        } else {
            console.log('Session['+session_id+'] Connection not open.  Waiting for connection to open to deliver request');
            waitConnection = setInterval(function() {
                if (NodeCast.services[NodeCast.active_app].connection) {
                    NodeCast.services[NodeCast.active_app].connection.send('{"channel":0, "requestId":'+session_id+', "type": "CHANNELREQUEST"}');
                    clearInterval(waitConnection);
                    console.log('Session['+session_id+'] Connection became available.  Channel Request sent!');
                }
            },100);
        }
    }
}

var sessions = [];
var session_count = 0;

server.on('upgrade', function(request, socket, body) {
  //console.log(request, body);
  var headers = request.headers;
  var host = headers.host;

  if (host.indexOf('localhost') > -1) {
    fromChrome = true;
  } else {
    fromChrome = false;
  }

  if (WebSocket.isWebSocket(request) && headers.connection.toLowerCase() == 'upgrade' && headers.upgrade.toLowerCase() == 'websocket') {

    var url = request.url.substring(1);
    //console.log(url);

    if (url == 'connection' && fromChrome) {
        console.log('--connection--');
        ws = new WebSocket(request, socket, body, {ping: 5});
        ws.on('message', function(event) {
            var data = JSON.parse(event.data);
            //console.log(data);
            if (data.type == 'REGISTER') {
                if (typeof NodeCast.services[data.name] !== 'undefined') {
                    NodeCast.services[data.name].pingInterval = data.pingInterval;
                    NodeCast.services[data.name].protocols = data.protocols;

                    //console.log('server connected');
                    //console.log(data);
                    NodeCast.services[NodeCast.active_app].connection = ws;

                    //ws.send('{"channel":0, "requestId":'+server_session_id+', "type": "CHANNELREQUEST"}');
                    
                }
            } else if (data.type == 'CHANNELRESPONSE') {
                ws.send('{"URL":"ws://localhost:8008/session?'+data.requestId+'", "channel":0, "requestId":'+data.requestId+', "type":"NEWCHANNEL"}');
            } else {
                console.log(event.data);
            }
        });
    }

    if (url.indexOf('session') > -1) {
        session_id = url.split('?')[1];

        var ws = new WebSocket(request, socket, body);

        console.log('Session['+session_id+'] Traffic From: '+host);

        // Create a new session if it doesn't exist.
        if (typeof sessions[session_id] == 'undefined') {
            sessions[session_id] = new session(session_id);
        }

        // if fromChrome then add server socket else add to client
        if (fromChrome) {
            if (!sessions[session_id].getServer()) {
                sessions[session_id].addServer(ws);
            }

        } else {
            if (!sessions[session_id].getClient()) {
                sessions[session_id].addClient(ws);
                sessions[session_id].connectClientToServer();
            }
        }

        // Actually handle the message.
        ws.on('message', function(event) {
            
            data = JSON.parse(event.data);

            console.log(data[0], NodeCast.services[NodeCast.active_app].protocols);

            if (data[0] == 'cm') {
                console.log('pong');
                ws.send('["cm", { "type" : "pong" }]');
            } else {
                if (fromChrome) {
                    sessions[session_id].sendToClient(data);
                } else {
                    sessions[session_id].sendToServer(data);
                }  
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

