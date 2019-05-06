
import React, { useState } from 'react'
import Remarkable from 'remarkable';
import { Row, Col, Input } from 'antd';
import {BoardContext} from '../context';

const MarkdownEditor = (props) => {
  console.log('render markdowneditor');
 
  const  [markdown, setMarkdown] = React.useContext(BoardContext);

  const handleChange = (e) => {
    setMarkdown({md:e.target.value, qrcode:markdown.qrcode});
  }

  const getRawMarkup = () => {
    const md = new Remarkable('full', {
      html: true,
      linkify: true,
      typographer: true,
    });

    return { __html: md.render(markdown.md) };
  }

  return (
    <Row justify="center" gutter={24}>
      <Col span={12}><Input.TextArea rows="20"
        id="markdown-content"
        onChange={handleChange}
        defaultValue={markdown.md}
      /></Col>
      <Col span={12} className="content">

        <Row >
          <Col span={24} dangerouslySetInnerHTML={getRawMarkup()} ></Col>
          <Col style={{ display: 'inline-flex', justifyContent: 'center', alignItems: 'center' }} span={24}>
            {markdown.qrcode && (
              <img src={markdown.qrcode} alt="" />
            )}
          </Col>

        </Row>
      </Col>

    </Row>
  );
}


export default MarkdownEditor;