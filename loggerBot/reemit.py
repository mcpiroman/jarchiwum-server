import datetime
import sys
import os
import argparse
import time
import traceback

import common.utils as utils
from common.formatedOuput import FormatedOutputFileManager
from common.rawWsOutput import RawWsOutputFileManager
from common.ircHandler import IrcHandler

TARGET_IRC_CHANNEL = "#jadisco"

formated_output = None
irc_messages_buffer = ""
irc_handler = None

def main():
    arg_parser = argparse.ArgumentParser("poorchat_log_reemiter")
    arg_parser.add_argument("raw_input", help="Directory or file to take raw websocket output logs from.", type=str)
    arg_parser.add_argument("formated_output_dir", help="Directory to place formated output logs.", type=str)
    args = arg_parser.parse_args()

    if os.path.isfile(args.raw_input):
        input_file_paths = [args.raw_input]
    else:
        input_file_paths = utils.get_file_paths_in_dir(args.raw_input)

    for input_file_path in input_file_paths:
        with open(input_file_path, 'r', encoding='utf-8') as input_file:
            print('Reemitting file ' + input_file_path)
            global formated_output
            formated_output = FormatedOutputFileManager(args.formated_output_dir)

            global irc_handler
            irc_handler = IrcHandler(formated_output, on_irc_handler_output, TARGET_IRC_CHANNEL)
            irc_handler.open()
            
            for line in input_file.readlines():
                if len(line) == 0:
                    continue
        
                time_str, event_type, *input_content_enum = line.split(' ', 2)
                input_content = None if len(input_content_enum) == 0 else input_content_enum[0]
                
                [year_str, month_str, day_str, *_] = os.path.basename(input_file_path).split('-', 3)
                [hours_str, minutes_str, sec_and_millis_str] = time_str.split(':', 2)
                [seconds_str, millis_str] = sec_and_millis_str.partition('.')[::2]
                time = datetime.datetime(int(year_str), int(month_str), int(day_str), int(hours_str), int(minutes_str), int(seconds_str), int(millis_str)*1000)
                
                if event_type == '<':
                    ws_msg_text = utils.base64_2_str(input_content)
                    handle_irc_fragment(ws_msg_text, time)

def on_irc_handler_output(irc_msg):
    pass
    
def handle_irc_fragment(irc_msg_fragment, receive_time):
    global irc_messages_buffer
    irc_messages_buffer += irc_msg_fragment
    *irc_msessages, irc_messages_buffer = irc_messages_buffer.split("\r\n")
    
    for irc_msg in irc_msessages:
        irc_handler.handle_irc_msg(irc_msg, receive_time)

main()