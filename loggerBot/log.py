import websocket
import datetime
import sys
import os
import argparse
import threading
import time
import traceback

import common.utils as utils
from common.formatedOuput import FormatedOutputFileManager
from common.rawWsOutput import RawWsOutputFileManager
from common.ircHandler import IrcHandler

TARGET_IRC_SERVER_HOST = "wss://irc.poorchat.net"
TARGET_IRC_CHANNEL = "#jadisco"

web_socket = None
raw_ws_output = None
formated_output = None
irc_handler = None
irc_messages_buffer = ""

reconnect_on_close = True

def main():
    arg_parser = argparse.ArgumentParser("poorchat_logger")
    arg_parser.add_argument("formated_output_dir", help="Directory to place formated output logs.", type=str)
    arg_parser.add_argument("raw_output_dir", help="Directory to place raw websocket output logs.", type=str)
    args = arg_parser.parse_args()

    global raw_ws_output
    raw_ws_output = RawWsOutputFileManager(args.raw_output_dir)
    global formated_output
    formated_output = FormatedOutputFileManager(args.formated_output_dir)
   
    #websocket.enableTrace(True)
    global web_socket
    web_socket = websocket.WebSocketApp(TARGET_IRC_SERVER_HOST,
                                on_message = on_ws_message,
                                on_error = on_ws_error,
                                on_close = on_ws_close,
                                subprotocols=['base64', 'binary'])
    web_socket.on_open = on_ws_open

    global reconnect_on_close
    def ws_thread_start():
        while True:
            global irc_handler
            irc_handler = IrcHandler(formated_output, on_irc_handler_output, TARGET_IRC_CHANNEL)
            web_socket.run_forever()
            formated_output.switch_to_new_file()
            if not reconnect_on_close:
                break
            time.sleep(1)
        
    ws_thread = threading.Thread(target=ws_thread_start)
    ws_thread.start()
        
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("## closing..")
        reconnect_on_close = False
        web_socket.close()
        print("## closed")
        sys.exit(0)
    
def on_ws_open(ws):
    print("WS: Opened")
    raw_ws_output.connection_opened()
    irc_handler.open()

def on_ws_message(ws, ws_msg_base64):
    try:
        raw_ws_output.write_input_msg(ws_msg_base64)
        ws_msg_text = utils.base64_2_str(ws_msg_base64)
        handle_irc_fragment(ws_msg_text)
    except Exception as exc:
        if not isinstance(exc, GeneratorExit):
            print(f"Unhandled exception {type(exc)} : {exc}\nTrace: {traceback.print_exc()}")
            
        if raw_ws_output is not None:
            raw_ws_output.flush()
            
        raise
    
def on_ws_error(ws, error):
    print("WS: ERROR:", error)
    raw_ws_output.connection_error(error)

def on_ws_close(ws):
    print("WS: Closed")
    raw_ws_output.connection_closed()

def on_irc_handler_output(irc_msg):
    if web_socket is not None:
        ws_msg = utils.str_2_base64(irc_msg)
        raw_ws_output.write_output_msg(ws_msg)
        web_socket.send(ws_msg)

def handle_irc_fragment(irc_msg_fragment):
    global irc_messages_buffer
    irc_messages_buffer += irc_msg_fragment
    *irc_msessages, irc_messages_buffer = irc_messages_buffer.split("\r\n")
    
    for irc_msg in irc_msessages:
        irc_handler.handle_irc_msg(irc_msg, datetime.datetime.utcnow())

main()