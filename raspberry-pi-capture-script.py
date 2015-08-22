import http.client
import os
import subprocess
from urllib.parse import urlparse
from datetime import datetime, date, time

userName = "YOUR_OPEN_STACK_STORAGE_USER"
userPass = "YOUR_OPEN_STACK_STORAGE_PASSWORD"

# authentication token and storage url
storageUrl = None
authToken = None

# threshold for deciding if pictures differ
diffThreshold = 0.05

lastYearDir = None
lastMonthDir = None
lastDayDir = None
lastHourDir = None

isFirstFrame = True

# login using OpenStack REST api
def login():

	global userName
	global userPass
	global storageUrl
	global authToken

	client = http.client.HTTPConnection("ocs-pl.oktawave.com")
	client.request("GET", "/auth/v1.0", None, { "X-Auth-User": userName, "X-Auth-Key" : userPass })
	authResp = client.getresponse()
	authToken = authResp.headers["X-Auth-Token"]
	storageUrl = urlparse( authResp.headers["X-Storage-Url"] )
	
	print("Auth: ", authResp.status, authResp.reason)
	print(authResp.headers["X-Auth-Token"])
	print(authResp.headers["X-Storage-Url"])
	client.close()
	

# capture and upload photo (if different than previous)

def upload():

	global storageUrl
	global authToken

	currDate = datetime.now()
	
	pathYear = "/storage-test/Cam01_garaz/{0:04d}".format(currDate.year)
	pathMonth = pathYear + "/{0:02d}".format(currDate.month)
	pathDay = pathMonth + "/{0:02d}".format(currDate.day)
	pathHour = pathDay + "/{0:02d}".format(currDate.hour)
	path = pathHour + "/{0:02d}_{1:02d}.jpg".format(currDate.minute, currDate.second)
	
	global lastYearDir
	global lastMonthDir
	global lastDayDir
	global lastHourDir
	global isFirstFrame
	global diffThreshold
	
	# make sure that required directories are created
	
	if(lastYearDir != currDate.year):
		client = http.client.HTTPConnection(storageUrl.hostname)
		client.request("PUT", storageUrl.path + pathYear, None, { "X-Auth-Token": authToken, "Content-type": "application/directory", "Content-length": 0 })
		sendResp = client.getresponse()
		print("Create year folder: ", sendResp.status, sendResp.reason)
		lastYearDir = currDate.year
	
	if(lastMonthDir != currDate.month):
		client = http.client.HTTPConnection(storageUrl.hostname)
		client.request("PUT", storageUrl.path + pathMonth, None, { "X-Auth-Token": authToken, "Content-type": "application/directory", "Content-length": 0 })
		sendResp = client.getresponse()
		print("Create month folder: ", sendResp.status, sendResp.reason)
		lastMonthDir = currDate.month
		
	if(lastDayDir != currDate.day):
		client = http.client.HTTPConnection(storageUrl.hostname)
		client.request("PUT", storageUrl.path + pathDay, None, { "X-Auth-Token": authToken, "Content-type": "application/directory", "Content-length": 0 })
		sendResp = client.getresponse()
		print("Create day folder: ", sendResp.status, sendResp.reason)
		lastDayDir = currDate.day
		
	if(lastHourDir != currDate.hour):
		client = http.client.HTTPConnection(storageUrl.hostname)
		client.request("PUT", storageUrl.path + pathHour, None, { "X-Auth-Token": authToken, "Content-type": "application/directory", "Content-length": 0 })
		sendResp = client.getresponse()
		print("Create hour folder: ", sendResp.status, sendResp.reason)
		lastHourDir = currDate.hour
		
		
	# capture full HD image and it's miniature used for changes detection
	
	os.system("fswebcam -d /dev/video0 -i 0 --no-banner -r 1920x1080 --jpeg 80 cam01.jpg --scale 160x120 --jpeg 100 cam01_small.jpg")

	if isFirstFrame:
		framesDifferent = True
	else:
	
		# compare pictures using imagemagic's compare command and decide whether the pictures are different
		proc = subprocess.Popen("compare -metric RMSE cam01_small.jpg prev_small.jpg null: 2>&1", stdout=subprocess.PIPE,  shell=True)
		diff = str(proc.communicate()[0])
		diff = diff[diff.index("(") + 1 : diff.rindex(")")]
		diff = float(diff)
		framesDifferent = diff >= diffThreshold
		print ("Difference: ", diff, framesDifferent)		
	

	# if current and previous pictures are different enough, upload current photo to cloud storage
	if framesDifferent:	
		client = http.client.HTTPConnection(storageUrl.hostname)
		client.request("PUT", storageUrl.path + path, open("cam01.jpg", "rb"), { "X-Auth-Token": authToken, "Content-type": "image/jpeg" })
		sendResp = client.getresponse()
		print("Send: ", sendResp.status, sendResp.reason)
	
	# preserve current photo's miniature to compare it against next photo
	os.system("\cp cam01_small.jpg prev_small.jpg")
	isFirstFrame = False

while True:
	#once in every 3600 capture cycles ensure that script is authenticated
	login()

	for num in range(1,3600):
		upload()
