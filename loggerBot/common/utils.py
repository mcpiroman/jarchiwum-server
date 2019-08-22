import base64
import datetime
import re
import os

def print_with_time(*args):
    print('[' + datetime.datetime.now().strftime("%H:%M:%S") + ']', *args)

def str_2_base64(data, encoding="utf-8"):
    return str(base64.b64encode(data.encode(encoding)), encoding)

def base64_2_str(data, encoding="utf-8"):
    return str(base64.b64decode(data), encoding)

def get_file_paths_in_dir(dir):
    return [p for p in [os.path.join(dir, p) for p in os.listdir(dir)] if os.path.isfile(p)]

def parse_irc_msg(s):
    """Breaks a message from an IRC server into its tags, prefix, command, and arguments.
    """
    if not s:
        raise IRCBadMessage("Empty IRC line.")

    tags = {}
    if s.startswith("@"):
        s = s[1:]
        tags_str, s = s.split(" ", 1)
        tags = deconstruct_irc_tags(tags_str)

    prefix = ''
    trailing = []
    if s[0] == ':':
        prefix, s = s[1:].split(' ', 1)
    if s.find(' :') != -1:
        s, trailing = s.split(' :', 1)
        args = s.split()
        args.append(trailing)
    else:
        args = s.split()
    command = args.pop(0)
    return tags, prefix, command, args

def deconstruct_irc_tags(tags_str):
    return {key_value_pair.split("=",1)[0]: unescape_irc_tag_value(key_value_pair.split("=",1)[1]) for key_value_pair in tags_str.split(";")}

def construct_irc_tags(items):
    s = ""
    is_first_item = True
    for key, value in items.items():
        if not is_first_item:
            s += ";"
        s += key + "=" + escape_irc_tag_value(value)
        is_first_item = False
    return s

def get_irc_user_from_prefix(irc_prefix):
    return irc_prefix.split("!", 1)[0]


IRC_TAG_VALUE_ESCAPE_TRANSLATION = {";":  "\\:", " ":  "\\s", "\r": "\\r", "\n":  "\\n", "\\":  "\\\\"}
def escape_irc_tag_value(tag_value):
    mapping = IRC_TAG_VALUE_ESCAPE_TRANSLATION
    return escape(tag_value, mapping)

def unescape_irc_tag_value(tag_value):
    mapping = {value: key for key, value in IRC_TAG_VALUE_ESCAPE_TRANSLATION.items()}
    return escape(tag_value, mapping)

def escape(s, mapping):
    return re.sub('({})'.format('|'.join(map(re.escape, mapping.keys()))), lambda m: mapping[m.group()], s)