
import React from 'react'
import Remarkable from 'remarkable';
import { Row, Col, Input } from 'antd';
import {MdContext, QrContext} from '../context';

const MarkdownEditor = (props) => {
  console.log('render markdowneditor');
 
  const  [md, setMd] = React.useContext(MdContext);
  const [qr, ] = React.useContext(QrContext);
  const handleChange = (e) => {
    setMd(e.target.value);
  }

  const getRawMarkup = () => {
    const fullMd = new Remarkable('full', {
      html: true,
      linkify: true,
      typographer: true,
    });

    return { __html: fullMd.render(md) };
  }

  return (
    <Row justify="center" gutter={24}>
      <Col span={12}><Input.TextArea rows="20"
        id="markdown-content"
        onChange={handleChange}
        defaultValue={md}
      /></Col>
      <Col span={12} className="content">

        <Row >
          <Col span={24} dangerouslySetInnerHTML={getRawMarkup()} ></Col>
          <Col style={{ display: 'inline-flex', justifyContent: 'center', alignItems: 'center' }} span={24}>
            {qr && (
              <img src={qr} alt="" />
            )}
          </Col>

        </Row>
      </Col>

    </Row>
  );
}


export default MarkdownEditor;