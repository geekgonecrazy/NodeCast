NodeCast
========

Inspired by: https://github.com/dz0ny/leapcast

Not satisfied with just knowing the basics of how it works, had to dig in and figure it out.

I could have contributed to dz0ny's project.  But i'm not familiar with the python libraries he's using.

Plus this just makes perfect sense to write in node.

```Bash
git clone https://github.com/AaronOgle/NodeCast.git
cd NodeCast
npm install
node app.js <ip address> <device name>
```
Ip Address must be a local ip it can listen on.
Device name is optional defaults to "NodeCast"

Currently only the TicTacToe example works.  
TicTacToe Source: https://github.com/googlecast/cast-android-tictactoe

Android Google Cast SDK: https://developers.google.com/cast/downloads/GoogleCastSdkAndroid-1.0.0.zip

Will need to add Google Cast SDK jar file to project before compiling.



If you want to use your own reciever app just add a service to NodeCast init on line 191.
I plan to make it load from google's list soon, and make it easier to specify your own.
