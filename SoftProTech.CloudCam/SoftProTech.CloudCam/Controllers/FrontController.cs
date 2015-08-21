using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Web;
using System.Web.Caching;
using System.Web.Mvc;

namespace SoftProTech.CloudCam.Controllers
{
    public class FrontController : Controller
    {
        //OpenStack Object Storage authentication data
        private const string AuthLogin = "YOUR_OPEN_STACK_USER_NAME_HERE";
        private const string AuthPassword = "YOUR_OPEN_STACK_USER_PASSWORD_HERE";
        private const string AuthURL = "https://ocs-pl.oktawave.com/auth/v1.0";
        private const string StorageName = "webcam-preview";

        //Authentication response data transfer object
        private class AuthData
        {
            public string Token { get; set; }
            public string URL { get; set; }
        }

        //Cache-enabled getter of authentication data - url of storage and authentication token (see above DTO)
        private AuthData StorageAuthData
        {
            get
            {
                var token = Request.RequestContext.HttpContext.Cache["Oktawave.AuthToken"] as AuthData;

                if (token == null)
                {
                    var tmpToken = new AuthData();

                    var client = WebRequest.CreateHttp(AuthURL);

                    //pass user login and password
                    client.Headers.Add("X-Auth-User", AuthLogin);
                    client.Headers.Add("X-Auth-Key", AuthPassword);

                    var authResp = client.GetResponse();
                    //read authentication token and storage url
                    tmpToken.Token = authResp.Headers["X-Auth-Token"];
                    tmpToken.URL = authResp.Headers["X-Storage-Url"];
                    var expiration = Convert.ToInt32(authResp.Headers["X-Auth-Token-Expires"]);

                    Request.RequestContext.HttpContext.Cache.Add("Oktawave.AuthToken", tmpToken, null, DateTime.Now.AddSeconds((int)expiration * 0.5), Cache.NoSlidingExpiration, CacheItemPriority.High, null);
                    token = tmpToken;
                }

                return token;
            }
        }

        //This is our front page, maybe Index would be better
        [HttpGet]
        public ActionResult Run()
        {
            ViewBag.AuthToken = StorageAuthData.Token;
            ViewBag.URL = StorageAuthData.URL;

            return View();
        }

        //note: methods below are used as proxies of OpenStack Object Storage web API.
        //They are used because to overcome some security issues with some browsers
        //The other possible solution is: http://stackoverflow.com/questions/3102819/disable-same-origin-policy-in-chrome (if you use Chrome naturally).
        //If your provider allows you to set custom "Allow-Control-*" headers sent by API then you can do it as well.

        //An open-stack proxy used for downloading images from storage
        [HttpGet]
        public ActionResult GetImage(string path)
        {
            var url = StorageAuthData.URL + "/" + StorageName + "/" + path;

            var client = WebRequest.CreateHttp(url);

            //authenticate with previously received token
            client.Headers.Add("X-Auth-Token", StorageAuthData.Token);

            return File(client.GetResponse().GetResponseStream(), "image/jpeg");

        }

        //An open-stack proxy used for browsing directories in storage
        [HttpGet]
        public ActionResult Browse(string path)
        {
            var url = StorageAuthData.URL + "/" + StorageName + "?format=json";

            if (path != null)
                url = url + "&path=" + path;

            var client = WebRequest.CreateHttp(url);
            //authenticate with previously received token
            client.Headers.Add("X-Auth-Token", StorageAuthData.Token);

            using (var sb = new StreamReader(client.GetResponse().GetResponseStream()))
            {
                var json = sb.ReadToEnd();
                return Content(json, "application/json");
            }
        }
    }
}