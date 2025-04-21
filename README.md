# microcredential-research
マイクロクレデンシャルの調査のため作成

## メモ

### AWS環境セットアップ

```bash
cdk init --language typescript
```

### EC2のセットアップ

#### 1.GOのインストール

```bash
# ライブラリ類のインストール
apt-get update && apt-get upgrade -y
apt-get install -y libssl-dev make clang pkg-config libcurl4-openssl-dev libprotobuf-dev build-essential wget protobuf-compiler
apt  install protoc-gen-go
rm -rf /var/lib/apt/lists/*

# Goのインストール（1.24が必要）
wget https://go.dev/dl/go1.24.0.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.24.0.linux-amd64.tar.gz
echo "export PATH=$PATH:/usr/local/go/bin" >> ~/.profile
source ~/.profile
sudo apt-get update

# バージョンの確認
go version
> go version go1.24.0 linux/amd64

# 関連ライブラリのインストール
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
echo 'export PATH="$PATH:$(go env GOPATH)/bin"' >> ~/.bashrc
source ~/.bashrc
```

#### 2.Dockerのインストール

```bash
wget -qO- https://get.docker.com | sh
apt install docker-compose
sudo groupadd docker
sudo usermod -aG docker $USER

# バージョンの確認
docker --version
> Docker version 28.1.1, build 4eba377

docker-compose --version
> docker-compose version 1.29.2, build unknown
```

### マイクロクレデンシャル基盤のセットアップ

1. ビルド

```bash
# デモ用リポジトリにクローン
git clone https://github.com/dc4eu/vc.git
cd vc

# 微妙な修正を行う（vendorディレクトリ配下が古いため、エラーとなってしまう、、）
go get github.com/golang/protobuf@latest
go mod tidy
go mod vendor

# ビルド実行
make build
```

2. 環境スタート

```bash
```
