# provision-tplink

Provisioning tool for

### Install

```sh
git clone https://github.com/alexdrean/provision-tplink.git
cd provision-tplink
docker build -t provision-tplink .
```

### Run

```sh
docker run -it --init -p 7201:7201 provision-tplink
```

### Usage

```http request
GET http://localhost:7201/provision?hostname=<hostname>&ssid=<ssid>&psk=<psk>
```