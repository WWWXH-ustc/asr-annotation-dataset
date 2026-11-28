# 声谱 · ASR 媒体工作台

工作台用于浏览候选音频、跟随字幕试听和记录片段。工作台从 `annotation-v1` 的独立 XLSX 读取 103 条音频记录，并按素材编号加载对应字幕。字幕包另外包含 V128，可直接解压查看该字幕。

## 在新机器上启动

需要 Python 3.10 或更新版本和现代浏览器。生成本地资料清单时使用 openpyxl。

1. 从仓库首页的 **Code → Download ZIP** 下载代码，或使用 Git。在命令行进入下载后的 `workbench` 目录。
2. 从 [annotation-v1 Release](https://github.com/WWWXH-ustc/asr-annotation-dataset/releases/tag/annotation-v1) 下载两个音频分卷、`asr-subtitles.zip` 和独立的 `annotation-guide.xlsx`。
3. 在分卷所在目录拼接音频 ZIP，再把下面导入命令中的路径替换为下载文件的实际路径。

macOS / Linux

```sh
cat asr-audio.zip.part01 asr-audio.zip.part02 > asr-audio.zip
shasum -a 256 -c SHA256SUMS.txt  # 可选，先从 Release 下载校验文件
```

Windows 命令提示符（cmd.exe）

```bat
copy /b asr-audio.zip.part01+asr-audio.zip.part02 asr-audio.zip
```

回到 `workbench` 目录运行。Windows 上可将 `python3` 换为 `py -3`。

```sh
python3 -m pip install -r requirements.txt
python3 prepare_catalogue.py "/下载目录/annotation-guide.xlsx"
python3 import_media.py --audio "/下载目录/asr-audio.zip" --subtitles "/下载目录/asr-subtitles.zip"
python3 web/server.py
```

浏览器打开 [http://127.0.0.1:8765/](http://127.0.0.1:8765/)。若端口已被占用，用 `python3 web/server.py --port 8766` 启动，然后打开对应端口。按 Ctrl+C 停止。工作台监听本机回环地址。

导入命令支持单独导入音频或字幕，可重复执行，遇到已有文件会跳过。成功导入的文件按 `raw/<领域编号>/<素材编号>/` 存放。导入期间需为分卷、拼接后的 ZIP 和导入后的文件预留合计约 12 GB。GitHub 上的独立 XLSX 是最新版。

## 试听、标记和视频

- 可按领域、场景筛选，按标题或素材编号搜索。点击字幕可跳到对应时间，也可让字幕随播放高亮滚动。
- 在「片段标记」记录起止位置和备注。标记存放在当前浏览器，换机器前请导出 CSV 留存。
- 详情页中的来源链接可打开原视频。有对应的本地视频时，把 MP4 放到 `raw/<领域编号>/<素材编号>/<素材编号>.video.mp4`，例如 `raw/D01/V022/V022.video.mp4`，再刷新页面即可切换到视频。
- 「剔除」将样本移出在库列表。「归档（仅保留链接）」会删除该样本在工作台 `raw/` 中的本地媒体。候选状态写入 `manifests/candidate_review.json`，如需迁移这些状态可复制该文件。

`web/` 包含服务端和页面，`manifests/` 和 `logs/` 在本机生成，包含播放所需的素材清单及字幕来源记录。
