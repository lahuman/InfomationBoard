import React from 'react';
import { Row, Col, Input } from 'antd';
import QRCode from 'qrcode';
import { QrContext, UrlContext  } from '../context';

const Search = Input.Search;

const qrGen = (targetUrl, cb) => {
  // cb(targetUrl);
  QRCode.toDataURL(targetUrl, function (err, url) {
    cb(url);
  })
}

const QrCodeGen = (props) => {
  const [qr, setQr] = React.useContext(QrContext);
  const [, setUrl] = React.useContext(UrlContext);
  const onQrChange= (value) => {
    setQr(value);
  }
  
  return (
    <Row justify="center" gutter={24}>
      <Col span={12}>
        <Search
          placeholder="QR URL"
          enterButton="Generator"
          size="large"
          value={qr}
          onChange={e => onQrChange(e.target.value)}
          onSearch={value => qrGen(value, setUrl)}
        />
      </Col>
    </Row>
  );
}

export default QrCodeGen;
