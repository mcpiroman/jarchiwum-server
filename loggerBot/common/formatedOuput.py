import datetime
import sys
import os
import json

import common.utils as utils

class FormatedOutputFileManager:
    def __init__(self, targetDir):
        self.targetDir = targetDir
        self.currentFile = None
        self.currentFileDate = None
        self.current_file_last_event_time = None

    def write_message(self, receive_time, tags, user, user_modes, msg):
        self._write_event_base("msg", receive_time, tags, self._user_with_modes_to_str(user, user_modes) + " " + msg)
    
    def write_action_message(self, receive_time, tags, user, msg):
        self._write_event_base("action", receive_time, tags, user + " " + msg)
        
    def write_notice(self, receive_time, tags, notice_msg):
        self._write_event_base("notice", receive_time, tags, notice_msg)

    def write_joins(self, receive_time, tags, user):
        self._write_event_base("joins", receive_time, tags, user)
        
    def write_parts(self, receive_time, tags, user):
        self._write_event_base("parts", receive_time, tags, user)

    def write_user_modes_changed(self, receive_time, tags, user, new_modes):
        self._write_event_base("mode", receive_time, tags, self._user_with_modes_to_str(user, new_modes))

    def write_current_users(self, receive_time, tags, users_with_modes):
        msg = ""
        is_first_user = True
        for user, modes in users_with_modes.items():
            if not is_first_user:
                msg += " "
            msg += self._user_with_modes_to_str(user, modes)
            is_first_user = False
        self._write_event_base("users", receive_time, tags, msg)

    def write_topic(self, receive_time, tags, topic, set_user, set_date):
        if set_user is not None:
            tags["jarchiwum.pl/set-user"] = set_user
        if set_date is not None:
            tags["jarchiwum.pl/set-date"] = set_date
        self._write_event_base("topic", receive_time, tags, topic)

    def write_embed(self, receive_time, tags, json_data):
        self._write_event_base("embed", receive_time, tags, json_data)

    def _write_event_base(self, event_type, receive_time, tags, message=""):
        self._ensureOutputFile(receive_time)
        
        event_time = receive_time
        if "time" in tags:
            event_time = datetime.datetime.fromisoformat(tags.pop("time").replace("Z", "+00:00"))

        # Prevent events from being out of order regarding by their time
        # This can happend when switching between local and server time
        if self.current_file_last_event_time is not None and event_time.replace(tzinfo=None) < self.current_file_last_event_time.replace(tzinfo=None):
            event_time = self.current_file_last_event_time
        self.current_file_last_event_time = event_time

        event_time.replace(microsecond=event_time.microsecond // 1000 * 1000) # Round to milliseconds so floating point will match with the one from file
        
        self.currentFile.write(event_time.strftime("%H:%M:%S") + "." + f"{(event_time.microsecond // 1000):03}" + " ")
        self.currentFile.write(event_type + " ")
        tags_serialized = {key: self._serialize_tag_value(value) for key, value in tags.items()}
        self.currentFile.write("@" + utils.construct_irc_tags(tags_serialized) + " ")
        self.currentFile.write(message)
        self.currentFile.write("\n")

    def switch_to_new_file(self):
        if self.currentFile is not None and not self.currentFile.closed:
            self.currentFile.close()

    def _ensureOutputFile(self, current_time):
        if self.currentFileDate is not None and self.currentFileDate.date() != current_time.date():
            if self.currentFile is not None:
               self.currentFile.close()

        if self.currentFile is None or self.currentFile.closed:
            file_index = 0
            while True:
                path = self._get_file_path(current_time, file_index)
                if not os.path.isfile(path):
                    break
                file_index += 1

            self.currentFile = open(path, "wt", encoding="utf-8", newline="\n")
            self.currentFileDate = current_time
            self.current_file_last_event_time = None

    def _get_file_path(self, date, file_index):
        date_str = date.strftime("%Y-%m-%d")
        return os.path.join(self.targetDir, date_str + "-" + str(file_index) + ".txt")
            
    def _serialize_tag_value(self, obj):
        if isinstance(obj, (datetime.datetime, datetime.date)):
            return obj.isoformat()
        else:
            return str(obj)

    def _user_with_modes_to_str(self, user, modes):
        return "".join(modes) + ":" + user