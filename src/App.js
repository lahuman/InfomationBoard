import React from 'react';
import { Layout, Menu } from 'antd';
import MarkdownEditor from './components/MarkdownEditor'
import QrCodeGen from './components/QrCodeGen';

const { Header, Content, Footer } = Layout;


class App extends React.Component {
  constructor(props) {
    super(props);
    this.appendMkEditorValue = this.appendMkEditorValue.bind(this);
    this.qrcode = this.qrcode.bind(this);
    this.state = {
      qrcode: "<img src='https://lahuman.github.io/assets/img/logo.png' width='100px' />"
    };
  }
  qrcode(){
    return this.state.qrcode;
  }
  appendMkEditorValue(qrcodeImgTag) {
    this.setState({qrcode: qrcodeImgTag});
  }

  render() {
    let {qrcode} = this.state
    return (
      <Layout>
        <Header style={{ position: 'fixed', zIndex: 1, width: '100%' }}>
          <div className="logo" />
          <Menu
            theme="dark"
            mode="horizontal"
            defaultSelectedKeys={['0']}
            style={{ lineHeight: '64px' }}
          >
            <Menu.Item key="1">저장</Menu.Item>
            <Menu.Item key="2">불러오기</Menu.Item>
            <Menu.Item key="3">안내판 쇼</Menu.Item>
          </Menu>
        </Header>

        <Content style={{ padding: '0 50px', marginTop: 64 }}>
          <div style={{ background: '#fff', padding: 24, minHeight: 380 }}>
            <QrCodeGen callGenQRCode={this.appendMkEditorValue} />
            <MarkdownEditor qrcode={this.qrcode()} />
          </div>
        </Content>

        <Footer style={{ textAlign: 'center' }}>
          InformationBoard ©2019 Created by lahuman
    </Footer>
      </Layout>
    );
  }
}

export default App;
