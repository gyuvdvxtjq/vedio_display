import requests

def get_id(page):

    headers = {
        "accept": "application/json, text/plain, */*",
        "accept-language": "zh-CN,zh;q=0.9",
        "origin": "https://loibus001.top",
        "priority": "u=1, i",
        "referer": "https://loibus001.top/",
        "sec-ch-ua": "\"Chromium\";v=\"142\", \"Google Chrome\";v=\"142\", \"Not_A Brand\";v=\"99\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "cross-site",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"
    }
    url = "https://api.moegoat.com/api/user/library/tag/id"
    params = {
        "tag_id": "14",
        "sort": "latest",
        "page": page
    }
    response = requests.get(url, headers=headers, params=params).json()

    total = response['total']
    total_pages = response['total_pages']
    for data in response['data']:
        detail_id = data['id']
        title = data['loi_title']



def get_detail(detail_id):

    headers = {
        "accept": "application/json, text/plain, */*",
        "accept-language": "zh-CN,zh;q=0.9",
        "origin": "https://loibus001.top",
        "priority": "u=1, i",
        "referer": "https://loibus001.top/",
        "sec-ch-ua": "\"Chromium\";v=\"142\", \"Google Chrome\";v=\"142\", \"Not_A Brand\";v=\"99\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "cross-site",
        "sec-fetch-storage-access": "active",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"
    }
    url = f"https://api.moegoat.com/api/lois/{detail_id}"
    response = requests.get(url, headers=headers).json()
    images = response['data']['images']
    for img in images:
        保存到csv

    

if __name__ == "main":
    detail_id = get_id()