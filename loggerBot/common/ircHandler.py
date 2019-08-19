import datetime
import re
import inspect

import common.utils as utils

class IrcHandler:
    NAME_LIST_REFRESH_INTERVAL = datetime.timedelta(hours=6)
    NAME_LIST_REFRESH_DELAY_ERROR = datetime.timedelta(minutes=5)
    IRC_SERVER_TIME_REFRESH_INTERVAL = datetime.timedelta(hours=2)
    IRC_SERVER_TIME_REFRESH_DELAY_ERROR = datetime.timedelta(minutes=5)

    def __init__(self, fromated_output, output_func, target_channel):
        self.fromated_output = fromated_output
        self.output_func = output_func
        self.target_channel = target_channel
        
        self.current_users = {}
        self.current_supported_tokens = {}
        self.current_history_batch_ref_tag = None

        self.last_irc_command = None
        self.last_irc_tags = None
        self.just_joined_user = None
    
        self.just_sent_user_list_request = True
        self.just_irc_server_time_request = True
        self.remove_users_on_next_namesrpl = False
        
    def open(self):
        self.last_irc_server_time_refresh_time = datetime.datetime.utcnow()
        self.last_user_list_refresh_time = datetime.datetime.utcnow()
        self.output_func("CAP LS\r\n")
        self.output_func("CAP REQ :cap-notify batch echo-message multi-prefix server-time msgid poorchat.net/clear poorchat.net/color poorchat.net/embed poorchat.net/i18n poorchat.net/status poorchat.net/subscription poorchat.net/subscriptiongifter poorchat.net/shadowban\r\n")
        self.output_func("CAP END\r\n")
        self.output_func("USER Poorchat 0 * :Poorchat\r\n")

    def handle_irc_msg(self, irc_msg, receive_time):
        irc_tags, irc_prefix, irc_command, irc_args = utils.parse_irc_msg(irc_msg)

        #print(irc_tags, irc_prefix, irc_command, irc_args, sep="\n", end="\n\n")

        if irc_command == "PING":
            self.output_func("PONG irc.poorchat.net\r\n")
        elif irc_command == "001":
            self.output_func(f"JOIN {self.target_channel}\r\n")
            print(f"IRC: Joining {self.target_channel}")
        elif irc_command == "005": #RPL_ISUPPORT 
            self._handle_isupportrpl(irc_tags, irc_prefix, irc_args, receive_time)
        elif irc_command == "PRIVMSG":
            self._handle_privmsg(irc_tags, irc_prefix, irc_args, receive_time)
        elif irc_command == "NOTICE":
            self._handle_notice(irc_tags, irc_prefix, irc_args, receive_time)
        elif irc_command == "EMBED":
            self._handle_embed(irc_tags, irc_prefix, irc_args, receive_time)
        elif irc_command == "BATCH":
            self._handle_batch(irc_tags, irc_prefix, irc_args, receive_time)
        elif irc_command == "JOIN":
            self._handle_join(irc_tags, irc_prefix, irc_args, receive_time)
        elif irc_command == "PART":
            self._handle_part(irc_tags, irc_prefix, irc_args, receive_time)
        elif irc_command == "MODE":
            self._handle_mode(irc_tags, irc_prefix, irc_args, receive_time)      
        elif irc_command == "353": #RPL_NAME
            self._handle_namreply(irc_tags, irc_prefix, irc_args, receive_time)      
        elif irc_command == "366": #RPL_ENDOFNAMES
            self._handle_endofnamesrpl(irc_tags, irc_prefix, irc_args, receive_time)
        elif irc_command == "332": #RPL_TOPIC
            if irc_args[0] == "Guest" and irc_args[1] == self.target_channel:
                self.current_topic = irc_args[2]
                #print("Topic: ", irc_args[2])                        
        elif irc_command == "391": #RPL_TIME
            print("IRC: Got time")
            self.last_irc_server_time_refresh_time = datetime.datetime.now()
            self.just_irc_server_time_request = False
        else:
            #print("", irc_prefix, irc_command, irc_args, sep="\n", end="\n\n")
            pass

        if self.last_irc_command == "332": #RPL_TOPIC
            if irc_command == "333" and irc_args[0] == "Guest" and irc_args[1] == self.target_channel:
                set_user = utils.get_irc_user_from_prefix(irc_args[2])
                set_date = datetime.datetime.fromtimestamp(int(irc_args[3]))
                self.fromated_output.write_topic(receive_time, self.last_irc_tags, self.current_topic, set_user, set_date)
                #print(f"Topic set by {set_user} at {set_date}")
            else:
                self.fromated_output.write_topic(receive_time, self.current_topic, self.last_irc_tags, None, None)

        if self.last_user_list_refresh_time + IrcHandler.NAME_LIST_REFRESH_INTERVAL <= datetime.datetime.now() and not self.just_sent_user_list_request:
            self.just_sent_user_list_request = True
            print("IRC: Requesting names")
            self.output_func(f"NAMES #{self.target_channel}\r\n")
        if self.last_irc_server_time_refresh_time + IrcHandler.NAME_LIST_REFRESH_INTERVAL <= datetime.datetime.now() and not self.just_irc_server_time_request:
            print("IRC: Requesting time")
            self.output_func("TIME\r\n")
            self.just_irc_server_time_request = True

        self.last_irc_command = irc_command
        self.last_irc_tags = irc_tags
        self.just_joined_user = None

    def _handle_isupportrpl(self, irc_tags, irc_prefix, irc_args, receive_time):
        if irc_args[0] != "Guest":
            return
        for token in irc_args[1:-1]:
            key_value = token.split("=", 1)
            key = key_value[0]
            if key[0] == "-":
                del self.current_supported_tokens[key]
            elif len(key_value) == 2:
                self.current_supported_tokens[key] = key_value[1]
            else:
                self.current_supported_tokens[key] = None

    def _handle_privmsg(self, irc_tags, irc_prefix, irc_args, receive_time):
        if irc_args[0] != self.target_channel:
            return

        user = utils.get_irc_user_from_prefix(irc_prefix)
        if user not in self.current_users: #todo: if not in chat history
            # Actually that's possible
            self.current_users[user] = set()

        user_modes = self.current_users[user]
        msg = irc_args[1]
        if msg.startswith("\x01ACTION"):
            msg = msg[len("\x01ACTION"):-1]
            self.fromated_output.write_action_message(receive_time, irc_tags, user, msg)
        else:
            self.fromated_output.write_message(receive_time, irc_tags, user, user_modes, msg)
        #print(f"> {user}: {msg}")
        
    def _handle_notice(self, irc_tags, irc_prefix, irc_args, receive_time):
        if irc_args[0] != self.target_channel:
            return
        self.fromated_output.write_notice(receive_time, irc_tags, irc_args[1])

    def _handle_namreply(self, irc_tags, irc_prefix, irc_args, receive_time):
        args = irc_args
        if args[0] == "Guest" and args[1] == "=":
            args = args[2:]

        if args[0] != self.target_channel:
            return
        
        if self.remove_users_on_next_namesrpl:
            self.current_users.clear()
            self.remove_users_on_next_namesrpl = False
        
        users = args[1].split(" ")
        for user_str in users:
            user_mode_chars = self._get_user_mode_mapping().values()
            nick_start = next((i for i,c in enumerate(user_str) if c not in user_mode_chars)) 
            user = user_str[nick_start:]
            self.current_users[user] = set(user_str[:nick_start])
    
    def _handle_endofnamesrpl(self, irc_tags, irc_prefix, irc_args, receive_time):
        print("IRC: Got names")
        self.last_user_list_refresh_time = datetime.datetime.now()
        self.just_sent_user_list_request = False
        self.remove_users_on_next_namesrpl = True
        self.fromated_output.write_current_users(receive_time, irc_tags, self.current_users)

    def _handle_join(self, irc_tags, irc_prefix, irc_args, receive_time):
        if irc_args[0] != self.target_channel:
            return
        user = utils.get_irc_user_from_prefix(irc_prefix)
        if user != "Guest" and user not in self.current_users:
            self.current_users[user] = set()
            self.just_joined_user = user
            self.fromated_output.write_joins(receive_time, irc_tags, user)
            #print("Joins", user)

    def _handle_part(self, irc_tags, irc_prefix, irc_args, receive_time):
        if irc_args[0] != self.target_channel:
            return
        user = utils.get_irc_user_from_prefix(irc_prefix)
        if self.current_users.pop(user, None) is not None:
            self.fromated_output.write_parts(receive_time, irc_tags, user)
            #print("Parts", user)
    
    def _handle_mode(self, irc_tags, irc_prefix, irc_args, receive_time): # todo: channel modes
        if irc_args[0] != self.target_channel or len(irc_args) < 3:
            return
        
        users = irc_args[2:]
        user = users[0]
        if not all(user == u for u in users[1:]):
            return
        
        if user not in self.current_users:
            return
        
        modes_str = irc_args[1]
        add_mode = True
        user_mode_mapping = self._get_user_mode_mapping()
        for mode_letter in modes_str:
            if mode_letter == "+":
                add_mode = True
            elif mode_letter == "-":
                add_mode = False
            elif mode_letter in user_mode_mapping:
                mode_char = user_mode_mapping[mode_letter]
                if add_mode:
                    self.current_users[user].add(mode_char)
                else:
                    self.current_users[user].discard(mode_char)
        
        self.fromated_output.write_user_modes_changed(receive_time, irc_tags, user, self.current_users[user])

    def _handle_embed(self, irc_tags, irc_prefix, irc_args, receive_time):
        if irc_args[0] != self.target_channel:
            return
        json_data = irc_args[1]
        self.fromated_output.write_embed(receive_time, irc_tags, json_data)
    
    def _handle_batch(self, irc_tags, irc_prefix, irc_args, receive_time):
        if len(irc_args) == 0:
            # No-op batch, allowed by standard
            return
        
        batch_ref_tag_str = irc_args[0]
        batch_ref_tag = batch_ref_tag_str[1:]
        if batch_ref_tag_str.startswith('+'):
            batch_type = irc_args[1]
            if batch_type == "chathistory":
                channel = irc_args[2]
                if channel == self.target_channel:
                    self.current_history_batch_ref_tag = batch_ref_tag
        else:
            if batch_ref_tag == self.current_history_batch_ref_tag:
                self.current_history_batch_ref_tag = None
            
    def _get_user_mode_mapping(self):
        if "PREFIX" in self.current_supported_tokens and self.current_supported_tokens["PREFIX"] is not None:
            prefixes = self.current_supported_tokens["PREFIX"]
            if prefixes[0] == "(":
                letters = list(prefixes[1:prefixes.find(")")])
                prefixes = prefixes[len(letters)+2:]
            else:
                letters = [None] * len(prefixes)
            symbols = list(prefixes)
            modes = dict(zip(letters, symbols))
            return modes
        else:
            print(f"{inspect.currentframe().f_code.co_name} - falling back to hardcoded modes")
            return {'a': '!', 'm': '*', 'q': '~', 'o': '@', 'h': '%', 'v': '+', 'g': '$'}
            
class IRCBadMessage(Exception):
    pass