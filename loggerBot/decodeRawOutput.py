import os
import pathlib
import argparse
import common.utils as utils

arg_parser = argparse.ArgumentParser("poorchat_logger")
arg_parser.add_argument("input", help="Folder or file path", type=str)
arg_parser.add_argument("output", help="Folder or file path", type=str)
args = arg_parser.parse_args()

input_str = args.input
output_str = args.output
if os.path.isfile(input_str):
    input_file_paths = [input_str]
else:
    input_file_paths = utils.get_file_paths_in_dir(input_str)
    
for input_file_path in input_file_paths:
    with open(input_file_path, 'r', encoding='utf-8') as input_file:
        output_file_path = os.path.join(output_str, os.path.basename(input_file_path))
        with open(output_file_path, 'w', encoding='utf-8') as output_file:
            for line in input_file.readlines():
                if len(line) == 0:
                    continue
                time, event_type, *input_content_enum = line.split(' ', 2)
                input_content = None if len(input_content_enum) == 0 else input_content_enum[0]
                
                if event_type in ['>', '<']:
                    output_content = utils.base64_2_str(input_content).replace('\n', '\\n').replace('\r', '\\r')
                else:
                    output_content = input_content
                
                output_file.write(time + ' ' + event_type)
                if output_content is not None:
                    output_file.write(output_content)
                output_file.write('\n')
                    
            