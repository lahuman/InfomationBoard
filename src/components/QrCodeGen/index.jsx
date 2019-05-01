import React, { useState, useEffect } from 'react';
import { Row, Col, Input } from 'antd';
import QRCode from 'qrcode';

const Search = Input.Search;

const qrGen = (targetUrl, cb) => {
  QRCode.toDataURL(targetUrl, function (err, url) {
    cb(`<img src="${url}" />`);
  })
}

const QrCodeGen = (props) => {

  return (
    <Row justify="center" gutter={24}>
      <Col span={12}>
        <Search
          placeholder="QR URL"
          enterButton="Generator"
          size="large"
          defaultValue="http://"
          onSearch={value => qrGen(value, props.action)}
        />
      </Col>
    </Row>
  );
}


export default QrCodeGen;