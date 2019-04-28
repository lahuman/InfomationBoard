import React from 'react';
import { Row, Col, Input } from 'antd';
import QRCode from 'qrcode';

const Search = Input.Search;

const qrGen =  (targetUrl, cb) => {
 QRCode.toDataURL(targetUrl, function (err, url) {
   cb(`<img src="${url}" />`);
  })
}

class QrCodeGen extends React.Component {

  constructor(props) {
    super(props);
    this.state = { value: 'Hello, **world**!' };
  }
  
  render() {
    return (
      <Row justify="center" gutter={24}>
        <Col span={12}>
          <Search
            placeholder="QR URL"
            enterButton="Generator"
            size="large"
            defaultValue="http://"
            onSearch={value => qrGen(value, this.props.callGenQRCode)}
          />
        </Col>
      </Row>
    );
  }
}


export default QrCodeGen;