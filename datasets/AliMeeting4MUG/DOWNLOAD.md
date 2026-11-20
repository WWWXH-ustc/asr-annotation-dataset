# AliMeeting4MUG 文本语料

此目录保存从官方 ModelScope 下载的原始文件，供跨机器获取。原始文件和官方 README 未改动。

- 官方来源：https://modelscope.cn/datasets/modelscope/Alimeeting4MUG/summary
- 官方代码：https://github.com/alibaba-damo-academy/SpokenNLP/tree/main/alimeeting4mug
- 发布方：阿里巴巴相关团队、魔搭社区、天池平台与浙江大学，详见官方 README。
- 许可：原始 README 声明 CC BY 4.0，使用和再分发时请保留来源及署名；许可说明：https://creativecommons.org/licenses/by/4.0/
- 本目录为镜像整理，非官方发布；未修改原始语料。
- 下载日期：2026-11-20。

## 文件与去重

`train.zip`：295场；`dev.zip`：65场；`except_TS_test1.zip`：82场；`except_TS_test2_without_label.zip`：82场；`only_TS_test1.zip`：65场；`only_TS_test2_without_label.zip`：65场。

`except_TS_test1_without_label.zip` 和 `only_TS_test1_without_label.zip` 分别是对应测试集的无标签版本，不能重复计入独立会议数。

按 meeting_key 去重共654场会议、399426条句子、7054880个文本字符（含标点及非汉字）。ZIP内文件扩展名为CSV，实际以制表符分隔，content列是JSON；句子正文位于 sentences[].s。

## 在其他机器获取

获取完整仓库：

```bash
git clone https://github.com/WWWXH-ustc/asr-annotation-dataset.git
cd asr-annotation-dataset/datasets/AliMeeting4MUG
```

只下载较小的开发集：

```bash
curl -L --fail -o dev.zip https://raw.githubusercontent.com/WWWXH-ustc/asr-annotation-dataset/main/datasets/AliMeeting4MUG/dev.zip
```

完整下载后校验（Linux）：`sha256sum -c SHA256SUMS`；macOS：`shasum -a 256 -c SHA256SUMS`。

原始任务、字段、署名引用与标注说明参见同目录官方 README.md。

## 训练集分卷

因大文件上传连接不稳定，训练集按原始字节拆成8个分卷。下载后运行：

```bash
cat train.zip.part* > train.zip
```

随后使用 SHA256SUMS 校验，合并结果与原始 train.zip 完全一致。
