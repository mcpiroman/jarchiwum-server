import urllib.request
from bs4 import BeautifulSoup

#dates = ["2018-10-08"]
#phpsessionid = "liq7n066cqu27h2pgir5teul77";
dates = input("Dates: ").split()
phpsessionid = input("Phpsessionid: ")
outputDic = "F:\\poorchatLogs\\server"
headers = {}

def setHeaders():
    global headers
    headers = {"Cookie" : "PHPSESSID=" + phpsessionid }

setHeaders()
for date in dates:
    print("date:", date)
    filePath = outputDic + "\\" + str(date) + ".log" 
    totalPages = 1
    currPage = 1
    totalPagesResolved = False
    events = []
    prevEvents = []
    try:
        with open(filePath, "r", encoding="utf-8", newline='\n') as logFile:
            prevEvents = logFile.readlines()
            if any(prevEvents):
                if prevEvents[-1].startswith("!!!"):
                    currPage = int(prevEvents[-1][3:])
                    del prevEvents[-1]
                else:
                    print("skipping", date)
                    continue
            else:
                prevEvents = []
    except FileNotFoundError:
        pass
    while currPage <= totalPages:
        print("  index:", currPage)
        url = "https://stats.pancernik.info/log/" + date + '/' + str(currPage)
        reqs = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(reqs) as resp:
            doc = BeautifulSoup(resp.read().decode("utf-8"),"lxml")   # features="html.parser"
            if doc.find("div", {"class":"g-recaptcha"}):
                print("!CAPTCHA")
                newPhpsessionid = input("Refresh captcha: ")
                if any(newPhpsessionid):
                    phpsessionid = newPhpsessionid
                    setHeaders()
                continue
            eventEntries = doc.select("table.table-striped.table-bordered > tr")
            for eventEntry in eventEntries:
                eventEntryChildren = [c for c in eventEntry.children if c != '\n']
                
                timeString = eventEntryChildren[0].contents[0].text
                hour = timeString[0:2]
                minute = timeString[3:5]
                second = timeString[6:8]
                
                event_str = '[' + hour + ':' + minute + ':' + second + '] '
                
                if len(eventEntryChildren) == 2: #log event
                    msg = eventEntryChildren[1].text
                    if msg.startswith('* '):
                        event_str += msg
                    else:
                        event_str += '*** ' + msg
                elif len(eventEntryChildren) == 3: #message event
                    user = eventEntryChildren[1].contents[0].text
                    msg = eventEntryChildren[2].text
                    event_str += '<' + user + '> ' + msg
                else:
                    raise Exception("Unknown event type (tr element has " + str(len(eventEntry.contents)) + " children")
                
                events.append(event_str+ '\n')
            if not totalPagesResolved:
                linkToLastDoc = doc.select("body > .content > .container > .row.row-margin > .col-lg-8.text-center > .pagination.pagination-lg")[0].find_all("li")[-1].find("a")
                totalPages = int(linkToLastDoc.get("href")[-2:]);
                totalPagesResolved = True
                print("    !total:",totalPages)
        currPage += 1
    with open(filePath, "w", encoding="utf-8", newline="\n") as logFile:
        for e in reversed(events):
            logFile.write(e)
        for e in prevEvents:
            logFile.write(e)
        if currPage < totalPages:
            logFile.write("!!!" + str(currPage))
print("DONE")

