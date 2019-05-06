import React from 'react';
import { Row, Col, Input } from 'antd';
import QRCode from 'qrcode';
import { BoardContext } from '../context';

const Search = Input.Search;

const qrGen = (targetUrl, mk, cb) => {
  QRCode.toDataURL(targetUrl, function (err, url) {
    cb({md:mk.md, qrcode: url});
  })
}

const QrCodeGen = (props) => {
  const [markdown, setMarkdown] = React.useContext(BoardContext);

  return (
    <Row justify="center" gutter={24}>
      <Col span={12}>
        <Search
          placeholder="QR URL"
          enterButton="Generator"
          size="large"
          defaultValue="http://"
          onSearch={value => qrGen(value, markdown, setMarkdown)}
        />
      </Col>
    </Row>
  );
}


export default QrCodeGen;