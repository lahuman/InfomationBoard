import React from 'react';
import { Layout, Menu, Breadcrumb } from 'antd';
import MarkdownEditor from './components/MarkdownEditor'
const { Header, Content, Footer } = Layout;


class App extends React.Component {

  render() {
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
      <MarkdownEditor />
      </div>
    </Content>
  

    <Footer style={{ textAlign: 'center' }}>
      Ant Design ©2018 Created by Ant UED
    </Footer>
  </Layout>
    );
  }
}

export default App;
