import datetime
import sys
import os
import json

class RawWsOutputFileManager:
    def __init__(self, targetDir):
        self.targetDir = targetDir
        self.currentFile = None
        self.currentFileDate = None
    
    def connection_opened(self):
        self._write_event_base("opened")
        
    def connection_closed(self):
        self._write_event_base("closed")
        if self.currentFile is not None and not self.currentFile.closed:
            self.currentFile.close()
        
    def connection_error(self, msg):
        self._write_event_base("error", msg)
    
    def write_input_msg(self, msg):
        self._write_event_base("<", msg)
    
    def write_output_msg(self, msg):
        self._write_event_base(">", msg)

    def _write_event_base(self, event_type, message=""):
        self._ensureOutputFile()

        now = datetime.datetime.utcnow()
        self.currentFile.write(now.strftime("%H:%M:%S") + "." + f"{(now.microsecond // 1000):03}" + " ")
        self.currentFile.write(event_type + " ")
        self.currentFile.write(message)
        self.currentFile.write("\n")
        
    def flush(self):
        if self.currentFile is not None and not self.currentFile.closed:
            self.currentFile.flush()
        
    def _ensureOutputFile(self):
        now = datetime.datetime.utcnow()

        if self.currentFileDate is not None and self.currentFileDate.date() != now.date():
            if self.currentFile is not None:
               self.currentFile.close()

        if self.currentFile is None or self.currentFile.closed:
            file_index = 0
            while True:
                path = self._get_file_path(now, file_index)
                if not os.path.isfile(path):
                    break
                file_index += 1

            self.currentFile = open(path, "wt", encoding="utf-8", newline="\n")
            self.currentFileDate = now
            
    def _get_file_path(self, date, file_index):
        date_str = date.strftime("%Y-%m-%d")
        return os.path.join(self.targetDir, date_str + "-" + str(file_index) + ".ws")